from __future__ import annotations

import hashlib
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
    OOSReport,
    RegimeAnalysis,
    RegimePerformance,
    RunMetadata,
    WalkForwardPeriod,
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


def _validate_prices(prices: pd.DataFrame, symbols: List[str], start_date: date, lookback_days: int) -> None:
    """Validate price data integrity before running backtest."""
    for s in symbols:
        if s not in prices.columns:
            continue
        col = prices[s]
        non_null = col.dropna()
        if len(non_null) == 0:
            raise ValueError(f"No price data for {s}")
        if (non_null < 0).any():
            raise ValueError(f"Negative prices found for {s}")
        # Check for single-day returns > 100%
        rets = non_null.pct_change().dropna()
        extreme = rets[rets.abs() > 1.0]
        if len(extreme) > 0:
            dates_str = ", ".join(str(d.date()) for d in extreme.index[:3])
            raise ValueError(f"{s} has single-day returns > 100% on: {dates_str} — likely data error")
        # Missing data ratio after ffill
        total_rows = len(prices)
        missing = col.isna().sum()
        if total_rows > 0 and missing / total_rows > 0.05:
            raise ValueError(f"{s} has {missing}/{total_rows} missing values ({missing/total_rows:.0%}) — exceeds 5% threshold")
    # Check lookback availability
    data_start = prices.index[0].date() if hasattr(prices.index[0], 'date') else prices.index[0]
    required_start = start_date - timedelta(days=lookback_days)
    if data_start > required_start:
        logger.warning(f"Data starts at {data_start}, need {required_start} for full lookback — results may be affected")


def _compute_data_hash(prices: pd.DataFrame) -> str:
    """Compute a stable hash from price DataFrame shape and boundary values."""
    parts = [str(prices.shape)]
    if len(prices) > 0:
        parts.append(str(prices.iloc[0].values.tolist()))
        parts.append(str(prices.iloc[-1].values.tolist()))
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _compute_oos_report(
    walk_forward_periods: List[WalkForwardPeriod],
    eq_series: pd.Series,
    prices: pd.DataFrame,
    available: List[str],
    config: BacktestConfig,
) -> OOSReport:
    """Aggregate walk-forward periods into in-sample vs out-of-sample comparison."""
    if len(walk_forward_periods) < 2:
        return OOSReport(num_periods=len(walk_forward_periods))

    oos_returns = [p.return_pct for p in walk_forward_periods]
    num = len(oos_returns)

    avg_oos = float(np.mean(oos_returns))
    median_oos = float(np.median(oos_returns))
    hit_rate = float(np.mean([1 if r > 0 else 0 for r in oos_returns]))

    # OOS Sharpe approximation: annualize period returns
    # Assume quarterly periods (~63 trading days)
    oos_arr = np.array(oos_returns)
    if oos_arr.std() > 0:
        periods_per_year = 252 / max((eq_series.index[-1] - eq_series.index[0]).days / num, 1)
        oos_sharpe = float((oos_arr.mean() * periods_per_year - 0.04) / (oos_arr.std() * np.sqrt(periods_per_year)))
    else:
        oos_sharpe = 0.0

    # In-sample: compute lookback-window returns for each period
    is_returns = []
    for p in walk_forward_periods:
        try:
            ts = pd.Timestamp(p.train_start)
            te = pd.Timestamp(p.train_end)
            window = prices[available].loc[ts:te]
            if len(window) > 1:
                # Equal-weight portfolio return over training window
                daily_rets = window.pct_change().dropna().mean(axis=1)
                period_ret = float((1 + daily_rets).prod() - 1)
                is_returns.append(period_ret)
        except Exception:
            continue

    avg_is = float(np.mean(is_returns)) if is_returns else 0.0
    is_arr = np.array(is_returns) if is_returns else np.array([0.0])
    if is_arr.std() > 0 and len(is_returns) > 1:
        is_sharpe = float((is_arr.mean() * periods_per_year - 0.04) / (is_arr.std() * np.sqrt(periods_per_year)))
    else:
        is_sharpe = 0.0

    # Performance decay
    decay = 0.0
    if is_sharpe > 0:
        decay = float((oos_sharpe - is_sharpe) / is_sharpe)
    elif avg_is > 0:
        decay = float((avg_oos - avg_is) / avg_is)

    return OOSReport(
        num_periods=num,
        avg_oos_return=round(avg_oos, 6),
        median_oos_return=round(median_oos, 6),
        oos_hit_rate=round(hit_rate, 4),
        oos_sharpe_approx=round(oos_sharpe, 4),
        avg_is_return=round(avg_is, 6),
        is_sharpe_approx=round(is_sharpe, 4),
        performance_decay=round(decay, 4),
    )


def _compute_regime_analysis(
    eq_series: pd.Series,
    bench_series: pd.Series,
) -> RegimeAnalysis:
    """Classify each trading day into a market regime and compute per-regime metrics."""
    if len(eq_series) < 60 or len(bench_series) < 60:
        return RegimeAnalysis()

    bench_daily = bench_series.pct_change().dropna()
    port_daily = eq_series.pct_change().dropna()

    # Align indices
    common = bench_daily.index.intersection(port_daily.index)
    bench_daily = bench_daily.loc[common]
    port_daily = port_daily.loc[common]

    # Rolling 63-day (quarterly) benchmark return and volatility for regime detection
    bench_rolling_ret = bench_daily.rolling(63, min_periods=30).mean() * 252
    bench_rolling_vol = bench_daily.rolling(63, min_periods=30).std() * np.sqrt(252)

    vol_median = bench_rolling_vol.median()

    # Classify regimes
    regimes = pd.Series(index=common, dtype=str)
    for i in common:
        if pd.isna(bench_rolling_ret.get(i)) or pd.isna(bench_rolling_vol.get(i)):
            regimes[i] = "unknown"
        elif bench_rolling_ret[i] < -0.05:
            regimes[i] = "bear"
        elif bench_rolling_vol[i] > vol_median * 1.3:
            regimes[i] = "high_vol"
        else:
            regimes[i] = "bull"

    # Compute per-regime metrics
    regime_perfs = []
    for regime_name in ["bull", "bear", "high_vol"]:
        mask = regimes == regime_name
        if mask.sum() < 5:
            continue

        r_port = port_daily[mask]
        r_eq = eq_series.loc[r_port.index]

        days = int(mask.sum())
        total_ret = float((1 + r_port).prod() - 1)
        years = days / 252
        ann_ret = float((1 + total_ret) ** (1 / years) - 1) if years > 0.1 else total_ret
        vol = float(r_port.std() * np.sqrt(252)) if len(r_port) > 1 else 0.0
        sharpe = float((ann_ret - 0.04) / vol) if vol > 0 else 0.0

        # Max drawdown within regime days
        if len(r_eq) > 1:
            running_max = r_eq.expanding().max()
            dd = (r_eq - running_max) / running_max
            max_dd = float(abs(dd.min()))
        else:
            max_dd = 0.0

        regime_perfs.append(RegimePerformance(
            regime=regime_name,
            trading_days=days,
            total_return=round(total_ret, 6),
            annualized_return=round(ann_ret, 6),
            volatility=round(vol, 6),
            sharpe=round(sharpe, 4),
            max_drawdown=round(max_dd, 6),
            avg_daily_return=round(float(r_port.mean()), 6),
        ))

    # Survives crashes: positive or only mildly negative return in bear regime
    bear = next((r for r in regime_perfs if r.regime == "bear"), None)
    bull = next((r for r in regime_perfs if r.regime == "bull"), None)
    survives = bear is not None and bear.annualized_return > -0.15
    recovery_ratio = 0.0
    if bear and bull and bull.total_return > 0:
        recovery_ratio = round(float(abs(bear.total_return) / bull.total_return), 4) if bear.total_return < 0 else 0.0

    return RegimeAnalysis(
        regimes=regime_perfs,
        survives_crashes=survives,
        crash_recovery_ratio=recovery_ratio,
    )


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
    # Reproducibility
    np.random.seed(42)

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

    # Data integrity checks
    _validate_prices(prices, available, config.start_date, config.lookback_days)

    # Reproducibility metadata
    config_hash = hashlib.sha256(config.model_dump_json().encode()).hexdigest()[:16]
    data_hash = _compute_data_hash(prices[available])
    run_metadata = RunMetadata(config_hash=config_hash, data_hash=data_hash)

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

    # Turnover tracking
    turnover_values: List[float] = []
    total_rebalances = 0

    # Walk-forward period tracking
    walk_forward_periods: List[WalkForwardPeriod] = []
    prev_rebalance_day: pd.Timestamp | None = None
    prev_rebalance_value: float | None = None
    prev_lookback_start: pd.Timestamp | None = None
    prev_lookback_end: pd.Timestamp | None = None

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

            # Get lookback window for optimization — use data BEFORE rebalance
            # day to avoid lookahead bias (we can't know today's close when
            # deciding trades at today's open)
            lookback_start = day - pd.Timedelta(days=config.lookback_days + 10)
            prev_day = day - pd.Timedelta(days=1)
            window = prices[available].loc[lookback_start:prev_day].dropna(how='all')

            # Only optimize if enough data
            valid_syms = [s for s in available if s in window.columns and len(window[s].dropna()) >= 30]
            if len(valid_syms) >= 2:
                opt_window = window[valid_syms].dropna()
                try:
                    strat_config = StrategyConfig(
                        strategy=config.strategy,
                        lookback_period=config.lookback_days,
                        max_weight=config.max_position_weight,
                    )
                    new_weights = strategy.optimize(opt_window, strat_config)

                    # Normalize to only valid symbols, guard against NaN/negative
                    new_weights = {k: max(v, 0) for k, v in new_weights.items()
                                   if pd.notna(v)}
                    total_w = sum(new_weights.values())
                    if total_w > 0:
                        new_weights = {k: v / total_w for k, v in new_weights.items()}
                    else:
                        new_weights = {s: 1 / len(valid_syms) for s in valid_syms}

                    # Hard position constraint: clamp and re-normalize
                    max_w = config.max_position_weight
                    for _ in range(10):  # iterate to convergence
                        clamped = {k: min(v, max_w) for k, v in new_weights.items()}
                        c_sum = sum(clamped.values())
                        if c_sum > 0:
                            clamped = {k: v / c_sum for k, v in clamped.items()}
                        if all(v <= max_w + 1e-9 for v in clamped.values()):
                            new_weights = clamped
                            break
                        new_weights = clamped

                    # Sanity check: weights must sum to ~1
                    w_sum = sum(new_weights.values())
                    if abs(w_sum - 1.0) > 1e-4:
                        logger.warning(f"Weights sum to {w_sum:.6f} at {day_date}, re-normalizing")
                        new_weights = {k: v / w_sum for k, v in new_weights.items()}

                    # Turnover calculation
                    turnover = sum(abs(new_weights.get(s, 0) - weights.get(s, 0))
                                   for s in set(list(new_weights.keys()) + list(weights.keys()))) / 2
                    turnover_values.append(turnover)
                    total_rebalances += 1
                    if turnover > 1.0:
                        logger.warning(f"Turnover {turnover:.2f} (>100%) at {day_date} — full portfolio flip")
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

                # Deduct transaction costs by reducing all positions proportionally
                # This correctly compounds the cost drag over time
                rebalance_cost = sum(
                    t.cost for t in all_trades if t.date == day_str
                )
                if rebalance_cost > 0 and port_val > 0:
                    cost_fraction = rebalance_cost / port_val
                    for s in shares:
                        shares[s] *= (1 - cost_fraction)

                # Walk-forward period: record previous period's return
                if prev_rebalance_day is not None and prev_rebalance_value is not None and port_val > 0:
                    period_return = port_val / prev_rebalance_value - 1
                    walk_forward_periods.append(WalkForwardPeriod(
                        train_start=str(prev_lookback_start.date() if hasattr(prev_lookback_start, 'date') else prev_lookback_start),
                        train_end=str(prev_lookback_end.date() if hasattr(prev_lookback_end, 'date') else prev_lookback_end),
                        test_start=str(prev_rebalance_day.date() if hasattr(prev_rebalance_day, 'date') else prev_rebalance_day),
                        test_end=str(day_date),
                        return_pct=round(float(period_return), 6),
                    ))

                prev_rebalance_day = day
                prev_rebalance_value = port_val
                prev_lookback_start = lookback_start
                prev_lookback_end = prev_day

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

        equity_curve.append((day, port_val))

        bench_val = bench_shares * float(bench_prices.loc[day]) if day in bench_prices.index else (
            bench_shares * bench_start_price
        )
        benchmark_curve.append((day, bench_val))

    # Final walk-forward period
    if prev_rebalance_day is not None and prev_rebalance_value is not None and equity_curve:
        final_val = equity_curve[-1][1]
        final_day = equity_curve[-1][0]
        period_return = final_val / prev_rebalance_value - 1
        walk_forward_periods.append(WalkForwardPeriod(
            train_start=str(prev_lookback_start.date() if hasattr(prev_lookback_start, 'date') else prev_lookback_start),
            train_end=str(prev_lookback_end.date() if hasattr(prev_lookback_end, 'date') else prev_lookback_end),
            test_start=str(prev_rebalance_day.date() if hasattr(prev_rebalance_day, 'date') else prev_rebalance_day),
            test_end=str(final_day.date() if hasattr(final_day, 'date') else final_day),
            return_pct=round(float(period_return), 6),
        ))

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
    metrics.avg_turnover = round(float(np.mean(turnover_values)), 4) if turnover_values else 0.0
    metrics.total_rebalances = total_rebalances
    bench_metrics = _compute_metrics(bench_series, bench_monthly, 0.0)

    # Out-of-sample report
    oos_report = _compute_oos_report(walk_forward_periods, eq_series, prices, available, config)

    # Regime analysis
    regime_analysis = _compute_regime_analysis(eq_series, bench_series)

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
        run_metadata=run_metadata,
        walk_forward_periods=walk_forward_periods,
        oos_report=oos_report,
        regime_analysis=regime_analysis,
    )
