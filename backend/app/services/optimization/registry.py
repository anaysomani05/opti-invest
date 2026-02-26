from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from pypfopt import expected_returns, risk_models

from app.models import (
    EfficientFrontierPoint,
    HoldingWithMetrics,
    StrategyConfig,
    StrategyInfo,
    StrategyOptimizationResult,
)
from app.services.portfolio_service import portfolio_service
from app.external.yfinance_client import yfinance_client

from .base import (
    BaseStrategy,
    calculate_current_weights,
    calculate_cvar,
    calculate_max_drawdown,
    calculate_portfolio_metrics,
    calculate_rebalancing_trades,
    generate_efficient_frontier,
)
from .mean_variance import MeanVarianceStrategy
from .min_variance import MinVarianceStrategy
from .risk_parity import RiskParityStrategy
from .black_litterman import BlackLittermanStrategy
from .hrp import HRPStrategy

logger = logging.getLogger(__name__)

STRATEGIES: Dict[str, BaseStrategy] = {
    "mean_variance": MeanVarianceStrategy(),
    "min_variance": MinVarianceStrategy(),
    "risk_parity": RiskParityStrategy(),
    "black_litterman": BlackLittermanStrategy(),
    "hrp": HRPStrategy(),
}


def get_all_strategies_info() -> List[StrategyInfo]:
    return [
        StrategyInfo(
            id=s.id,
            name=s.name,
            description=s.description,
            best_for=s.best_for,
            uses_expected_returns=s.uses_expected_returns,
            supports_weight_bounds=s.supports_weight_bounds,
        )
        for s in STRATEGIES.values()
    ]


async def _fetch_historical_data(symbols: List[str], lookback_days: int) -> pd.DataFrame:
    logger.info(f"Fetching historical data for {len(symbols)} symbols")
    historical_data = yfinance_client.get_historical_prices(symbols, period_days=lookback_days)

    if historical_data.empty:
        raise ValueError("No historical data retrieved")

    valid = [s for s in historical_data.columns if len(historical_data[s].dropna()) >= 60]
    historical_data = historical_data[valid]

    if historical_data.empty or len(valid) < 2:
        raise ValueError("Insufficient valid historical data for optimization")

    return historical_data


async def run_strategy(
    config: StrategyConfig,
    holdings: Optional[List[HoldingWithMetrics]] = None,
) -> StrategyOptimizationResult:
    strategy = STRATEGIES.get(config.strategy)
    if strategy is None:
        raise ValueError(f"Unknown strategy: {config.strategy}. Available: {list(STRATEGIES.keys())}")

    if holdings is None:
        if config.current_prices:
            holdings = await portfolio_service.get_holdings_with_provided_prices(config.current_prices)
        else:
            holdings = await portfolio_service.get_holdings_with_current_prices()

    if not holdings:
        raise ValueError("No holdings found in portfolio")
    if len(holdings) < 2:
        raise ValueError("Need at least 2 holdings for optimization")

    symbols = [h.symbol for h in holdings]
    current_weights = calculate_current_weights(holdings)

    prices = await _fetch_historical_data(symbols, config.lookback_period)

    optimal_weights = strategy.optimize(prices, config)

    mu = expected_returns.ema_historical_return(prices, span=180)
    S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
    metrics = calculate_portfolio_metrics(optimal_weights, mu, S, config.risk_free_rate)

    frontier = generate_efficient_frontier(mu, S, config.risk_free_rate)
    max_dd = calculate_max_drawdown(prices, optimal_weights)
    cvar = calculate_cvar(prices, optimal_weights)
    trades = calculate_rebalancing_trades(current_weights, optimal_weights, holdings)

    return StrategyOptimizationResult(
        strategy=strategy.id,
        strategy_name=strategy.name,
        optimal_weights=optimal_weights,
        expected_return=metrics["expected_return"],
        volatility=metrics["volatility"],
        sharpe_ratio=metrics["sharpe_ratio"],
        max_drawdown=max_dd,
        cvar=cvar,
        efficient_frontier=frontier,
        current_weights=current_weights,
        rebalancing_trades=trades,
        data_period=f"{config.lookback_period} days",
        strategy_metadata=strategy.get_metadata(),
    )
