from __future__ import annotations

import logging
from typing import Any, Dict

import pandas as pd
from pypfopt import EfficientFrontier, expected_returns, risk_models

from app.models import StrategyConfig
from .base import BaseStrategy

logger = logging.getLogger(__name__)


class MeanVarianceStrategy(BaseStrategy):
    id = "mean_variance"
    name = "Mean-Variance (Max Sharpe)"
    description = "Maximizes risk-adjusted returns using Modern Portfolio Theory. Finds the optimal Sharpe ratio on the efficient frontier."
    best_for = "General use — best risk/return tradeoff"
    uses_expected_returns = True
    supports_weight_bounds = True

    def optimize(self, prices: pd.DataFrame, config: StrategyConfig) -> Dict[str, float]:
        mu = expected_returns.ema_historical_return(prices, span=180)
        S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()

        ef = EfficientFrontier(mu, S)
        ef.add_constraint(lambda w: w >= config.min_weight)
        ef.add_constraint(lambda w: w <= config.max_weight)
        ef.max_sharpe(risk_free_rate=config.risk_free_rate)

        weights = ef.clean_weights(cutoff=0.005)
        total = sum(weights.values())
        if total > 0:
            weights = {s: w / total for s, w in weights.items()}
        return weights

    def get_metadata(self) -> Dict[str, Any]:
        return {"method": "max_sharpe", "return_model": "ema_historical"}
