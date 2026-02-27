from __future__ import annotations

import logging
from typing import List

from app.models import BacktestCompareRequest, BacktestConfig, BacktestResult
from app.services.backtest_engine import run_backtest

logger = logging.getLogger(__name__)


async def compare_strategies(
    req: BacktestCompareRequest,
    on_progress=None,
) -> List[BacktestResult]:
    """Run the same backtest for multiple strategies and return all results."""
    results: List[BacktestResult] = []

    for i, strategy_id in enumerate(req.strategies):
        if on_progress:
            await on_progress(
                "status",
                f"Running strategy {i + 1}/{len(req.strategies)}: {strategy_id}...",
            )

        config = BacktestConfig(
            symbols=req.symbols,
            strategy=strategy_id,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            rebalance_frequency=req.rebalance_frequency,
            lookback_days=req.lookback_days,
            benchmark=req.benchmark,
            transaction_cost_bps=req.transaction_cost_bps,
        )

        result = await run_backtest(config, on_progress=on_progress)
        results.append(result)

    return results
