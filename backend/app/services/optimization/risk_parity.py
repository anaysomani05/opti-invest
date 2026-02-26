from __future__ import annotations

import logging
from typing import Any, Dict

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from pypfopt import risk_models

from app.models import StrategyConfig
from .base import BaseStrategy

logger = logging.getLogger(__name__)


class RiskParityStrategy(BaseStrategy):
    id = "risk_parity"
    name = "Risk Parity"
    description = "Allocates so each asset contributes equally to total portfolio risk. Avoids hidden concentration."
    best_for = "True diversification at risk level"
    uses_expected_returns = False
    supports_weight_bounds = False

    def optimize(self, prices: pd.DataFrame, config: StrategyConfig) -> Dict[str, float]:
        S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
        cov = S.values
        n = cov.shape[0]
        symbols = list(S.columns)

        def risk_budget_objective(w):
            w = np.array(w)
            port_var = w @ cov @ w
            if port_var <= 0:
                return 1e10
            marginal = cov @ w
            risk_contrib = w * marginal
            target = port_var / n
            return float(np.sum((risk_contrib - target) ** 2))

        x0 = np.ones(n) / n
        bounds = [(0.005, 1.0)] * n
        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]

        result = minimize(
            risk_budget_objective,
            x0,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"ftol": 1e-12, "maxiter": 1000},
        )

        if not result.success:
            logger.warning("Risk parity optimizer did not converge, using best result")

        raw = result.x / result.x.sum()
        weights = {symbols[i]: round(float(raw[i]), 6) for i in range(n)}
        return weights

    def get_metadata(self) -> Dict[str, Any]:
        return {"method": "equal_risk_contribution", "optimizer": "scipy_SLSQP"}
