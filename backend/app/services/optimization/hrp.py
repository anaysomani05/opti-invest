from __future__ import annotations

import logging
from typing import Any, Dict

import pandas as pd
from pypfopt import HRPOpt

from app.models import StrategyConfig
from .base import BaseStrategy

logger = logging.getLogger(__name__)


class HRPStrategy(BaseStrategy):
    id = "hrp"
    name = "Hierarchical Risk Parity"
    description = "Uses ML clustering to build a hierarchical portfolio. Most robust to estimation errors."
    best_for = "Many holdings, noisy data"
    uses_expected_returns = False
    supports_weight_bounds = False

    def optimize(self, prices: pd.DataFrame, config: StrategyConfig) -> Dict[str, float]:
        returns = prices.pct_change().dropna()
        hrp = HRPOpt(returns)
        weights = hrp.optimize(linkage_method=config.linkage_method)
        cleaned = dict(hrp.clean_weights(cutoff=0.005))
        total = sum(cleaned.values())
        if total > 0:
            cleaned = {s: w / total for s, w in cleaned.items()}
        return cleaned

    def get_metadata(self) -> Dict[str, Any]:
        return {"method": "hierarchical_risk_parity", "clustering": "hierarchical"}
