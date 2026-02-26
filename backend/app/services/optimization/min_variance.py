from __future__ import annotations

import logging
from typing import Any, Dict

import pandas as pd
from pypfopt import EfficientFrontier, risk_models, objective_functions

from app.models import StrategyConfig
from .base import BaseStrategy

logger = logging.getLogger(__name__)


class MinVarianceStrategy(BaseStrategy):
    id = "min_variance"
    name = "Minimum Variance"
    description = "Minimizes total portfolio volatility. Focuses purely on risk reduction through diversification."
    best_for = "Risk-averse / capital preservation"
    uses_expected_returns = False
    supports_weight_bounds = True

    def optimize(self, prices: pd.DataFrame, config: StrategyConfig) -> Dict[str, float]:
        S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()

        ef = EfficientFrontier(None, S, weight_bounds=(config.min_weight, config.max_weight))
        ef.add_objective(objective_functions.L2_reg, gamma=0.1)
        ef.min_volatility()

        weights = ef.clean_weights(cutoff=0.005)
        total = sum(weights.values())
        if total > 0:
            weights = {s: w / total for s, w in weights.items()}
        return weights

    def get_metadata(self) -> Dict[str, Any]:
        return {"method": "min_volatility", "regularization": "L2"}
