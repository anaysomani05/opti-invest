from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from app.models import (
    BacktestConfig,
    BacktestMetrics,
    BacktestResult,
    BacktestTrade,
    EquityCurvePoint,
    MonthlyReturn,
    WeightSnapshot,
)
from app.external.yfinance_client import yfinance_client
from app.services.optimization.registry import STRATEGIES

logger = logging.getLogger(__name__)


def _generate_rebalance_dates(start: date, end: date, freq: str) -> List[date]:
    """Return a list of rebalance dates between start and end (inclusive of start)."""
    if freq == "buy_and_hold":
        return [start]

    delta_map = {
        "monthly": 30,
        "quarterly": 91,
        "semi_annual": 182,
        "annual": 365,
    }
    step = delta_map.get(freq, 91)
    dates = []
    d = start
    while d <= end:
        dates.append(d)
        d += timedelta(days=step)
    return dates


def _compute_metrics(
    equity: pd.Series, monthly_rets: pd.Series, total_costs: float
) -> BacktestMetrics:
    """Compute backtest performance metrics from an equity curve Series (indexed by date)."""
    if len(equity) < 2:
        return BacktestMetrics(
            total_return=0, cagr=0, volatility=0, sharpe=0, sortino=0,
            max_drawdown=0, max_drawdown_duration_days=0, calmar_ratio=0,
            cvar_95=0, win_rate_monthly=0, best_month=0, worst_month=0,
            total_transaction_costs=total_costs,
        )

    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1)
    days = (equity.index[-1] - equity.index[0]).days
    years = max(days / 365.25, 1 / 365.25)
    cagr = float((equity.iloc[-1] / equity.iloc[0]) ** (1 / years) - 1) if years > 0 else 0.0

    daily_ret = equity.pct_change().dropna()
    vol = float(daily_ret.std() * np.sqrt(252)) if len(daily_ret) > 1 else 0.0
    sharpe = float((cagr - 0.04) / vol) if vol > 0 else 0.0

    neg_ret = daily_ret[daily_ret < 0]
    downside_vol = float(neg_ret.std() * np.sqrt(252)) if len(neg_ret) > 1 else 0.0
    sortino = float((cagr - 0.04) / downside_vol) if downside_vol > 0 else 0.0

    running_max = equity.expanding().max()
    drawdowns = (equity - running_max) / running_max
    max_dd = float(abs(drawdowns.min())) if len(drawdowns) > 0 else 0.0

    # Max drawdown duration
    underwater = drawdowns < 0
    max_dur = 0
    cur_dur = 0
    for uw in underwater:
        if uw:
            cur_dur += 1
            max_dur = max(max_dur, cur_dur)
        else:
            cur_dur = 0

    calmar = float(cagr / max_dd) if max_dd > 0 else 0.0

    # CVaR 95%
    if len(daily_ret) > 5:
        var_5 = float(np.percentile(daily_ret, 5))
        tail = daily_ret[daily_ret <= var_5]
        cvar_95 = float(abs(tail.mean()) * np.sqrt(252)) if len(tail) > 0 else 0.0
    else:
        cvar_95 = 0.0

    # Monthly stats
    if len(monthly_rets) > 0:
        win_rate = float((monthly_rets > 0).sum() / len(monthly_rets))
        best_month = float(monthly_rets.max())
        worst_month = float(monthly_rets.min())
    else:
        win_rate = 0.0
        best_month = 0.0
        worst_month = 0.0

    return BacktestMetrics(
        total_return=round(total_return, 6),
        cagr=round(cagr, 6),
        volatility=round(vol, 6),
        sharpe=round(sharpe, 4),
        sortino=round(sortino, 4),
        max_drawdown=round(max_dd, 6),
        max_drawdown_duration_days=max_dur,
        calmar_ratio=round(calmar, 4),
        cvar_95=round(cvar_95, 6),
        win_rate_monthly=round(win_rate, 4),
        best_month=round(best_month, 6),
        worst_month=round(worst_month, 6),
        total_transaction_costs=round(total_costs, 2),
    )


async def run_backtest(
    config: BacktestConfig,
    on_progress=None,
) -> BacktestResult:
    """
    Walk-forward backtest: at each rebalance date, optimize weights using only
    data available up to that point, then simulate forward to the next rebalance.
    """
    strategy = STRATEGIES.get(config.strategy)
    if strategy is None:
        raise ValueError(f"Unknown strategy: {config.strategy}")

    symbols = sorted(set(s.upper() for s in config.symbols))
    if len(symbols) < 2:
        raise ValueError("Need at least 2 symbols for optimization")

    # Fetch full price history: lookback before start_date through end_date
    fetch_start = config.start_date - timedelta(days=config.lookback_days + 30)
    total_days = (config.end_date - fetch_start).days + 10

    if on_progress:
        await on_progress("status", f"Fetching historical data for {len(symbols)} symbols...")

    all_symbols = symbols + [config.benchmark]
    prices = yfinance_client.get_historical_prices(all_symbols, period_days=total_days)

    if prices.empty:
        raise ValueError("Failed to fetch historical data")

    # Ensure benchmark is present
    if config.benchmark not in prices.columns:
        raise ValueError(f"Benchmark {config.benchmark} data not available")

    # Filter to only symbols with data
    available = [s for s in symbols if s in prices.columns]
    if len(available) < 2:
        raise ValueError(f"Only {len(available)} symbols have data — need at least 2")

    # Trim to date range (allow lookback before start)
    prices = prices.sort_index().ffill()

    # Generate rebalance dates
    rebalance_dates = _generate_rebalance_dates(config.start_date, config.end_date, config.rebalance_frequency)

    # Filter prices to trading days within our range
    trading_days = prices.loc[str(config.start_date):str(config.end_date)].index
    if len(trading_days) < 5:
        raise ValueError("Too few trading days in the specified range")

    # Initialize portfolio tracking
    capital = config.initial_capital
    weights: Dict[str, float] = {}
    shares: Dict[str, float] = {}
    total_costs = 0.0

    equity_curve: List[Tuple[pd.Timestamp, float]] = []
    benchmark_curve: List[Tuple[pd.Timestamp, float]] = []
    weights_history: List[WeightSnapshot] = []
    all_trades: List[BacktestTrade] = []

    # Benchmark: buy-and-hold from start
    bench_prices = prices[config.benchmark].dropna()
    bench_start_idx = bench_prices.index.searchsorted(pd.Timestamp(config.start_date))
    if bench_start_idx >= len(bench_prices):
        bench_start_idx = 0
    bench_start_price = float(bench_prices.iloc[bench_start_idx])
    bench_shares = config.initial_capital / bench_start_price if bench_start_price > 0 else 0

    # Walk forward
    cost_rate = config.transaction_cost_bps / 10_000
    rebal_idx = 0
    from app.models import StrategyConfig

    for i, day in enumerate(trading_days):
        day_date = day.date() if hasattr(day, 'date') else day

        # Check if we need to rebalance
        should_rebalance = False
        if rebal_idx < len(rebalance_dates) and day_date >= rebalance_dates[rebal_idx]:
            should_rebalance = True
            rebal_idx += 1

        if should_rebalance:
            if on_progress and len(rebalance_dates) > 1:
                await on_progress("status", f"Optimizing period {rebal_idx}/{len(rebalance_dates)}...")

            # Get lookback window for optimization
            lookback_start = day - pd.Timedelta(days=config.lookback_days + 10)
            window = prices[available].loc[lookback_start:day].dropna(how='all')

            # Only optimize if enough data
            valid_syms = [s for s in available if s in window.columns and len(window[s].dropna()) >= 30]
            if len(valid_syms) >= 2:
                opt_window = window[valid_syms].dropna()
                try:
                    strat_config = StrategyConfig(
                        strategy=config.strategy,
                        lookback_period=config.lookback_days,
                    )
                    new_weights = strategy.optimize(opt_window, strat_config)

                    # Normalize to only valid symbols
                    total_w = sum(new_weights.values())
                    if total_w > 0:
                        new_weights = {k: v / total_w for k, v in new_weights.items()}
                    else:
                        new_weights = {s: 1 / len(valid_syms) for s in valid_syms}
                except Exception as e:
                    logger.warning(f"Optimization failed at {day_date}: {e}, using equal weight")
                    new_weights = {s: 1 / len(valid_syms) for s in valid_syms}

                # Calculate current portfolio value
                if shares:
                    port_val = sum(
                        shares.get(s, 0) * float(prices[s].loc[day])
                        for s in shares if s in prices.columns and day in prices.index
                    )
                else:
                    port_val = capital

                # Execute trades
                day_str = str(day_date)
                for s in set(list(new_weights.keys()) + list(shares.keys())):
                    target_val = new_weights.get(s, 0) * port_val
                    current_val = shares.get(s, 0) * float(prices[s].loc[day]) if s in shares and s in prices.columns else 0
                    trade_val = target_val - current_val
                    if abs(trade_val) > 1.0:  # minimum trade threshold
                        price = float(prices[s].loc[day]) if s in prices.columns else 0
                        if price > 0:
                            trade_shares = trade_val / price
                            cost = abs(trade_val) * cost_rate
                            total_costs += cost

                            shares[s] = shares.get(s, 0) + trade_shares
                            action = "BUY" if trade_val > 0 else "SELL"
                            all_trades.append(BacktestTrade(
                                date=day_str, symbol=s, action=action,
                                shares=round(abs(trade_shares), 4),
                                amount=round(abs(trade_val), 2),
                                cost=round(cost, 2),
                            ))

                # Deduct transaction costs from cash (adjust shares proportionally)
                # Simplification: costs are already tracked, just deduct from total
                weights = new_weights
                weights_history.append(WeightSnapshot(date=day_str, weights={k: round(v, 4) for k, v in weights.items()}))

        # Record daily portfolio value
        if shares:
            port_val = sum(
                shares.get(s, 0) * float(prices[s].loc[day])
                for s in shares if s in prices.columns
            )
        else:
            port_val = capital

        # Subtract accumulated costs
        port_val_net = port_val - total_costs if port_val > total_costs else port_val

        equity_curve.append((day, port_val_net))

        bench_val = bench_shares * float(bench_prices.loc[day]) if day in bench_prices.index else (
            bench_shares * bench_start_price
        )
        benchmark_curve.append((day, bench_val))

    if on_progress:
        await on_progress("status", "Calculating metrics...")

    # Build output
    eq_series = pd.Series(
        [v for _, v in equity_curve],
        index=pd.DatetimeIndex([d for d, _ in equity_curve]),
    )
    bench_series = pd.Series(
        [v for _, v in benchmark_curve],
        index=pd.DatetimeIndex([d for d, _ in benchmark_curve]),
    )

    # Monthly returns
    if len(eq_series) > 20:
        monthly = eq_series.resample('M').last().pct_change().dropna()
    else:
        monthly = pd.Series(dtype=float)

    monthly_ret_list = [
        MonthlyReturn(year=d.year, month=d.month, ret=round(float(v), 6))
        for d, v in monthly.items()
    ]

    # Benchmark monthly
    if len(bench_series) > 20:
        bench_monthly = bench_series.resample('M').last().pct_change().dropna()
    else:
        bench_monthly = pd.Series(dtype=float)

    metrics = _compute_metrics(eq_series, monthly, total_costs)
    bench_metrics = _compute_metrics(bench_series, bench_monthly, 0.0)

    # Build equity curve points
    eq_points = []
    for (d, pv), (_, bv) in zip(equity_curve, benchmark_curve):
        eq_points.append(EquityCurvePoint(
            date=str(d.date() if hasattr(d, 'date') else d),
            portfolio_value=round(pv, 2),
            benchmark_value=round(bv, 2),
        ))

    strategy_info = STRATEGIES[config.strategy]
    return BacktestResult(
        strategy=config.strategy,
        strategy_name=strategy_info.name,
        config=config,
        equity_curve=eq_points,
        weights_over_time=weights_history,
        trades=all_trades,
        metrics=metrics,
        benchmark_metrics=bench_metrics,
        monthly_returns=monthly_ret_list,
    )
