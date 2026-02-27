from __future__ import annotations

import logging
from typing import Dict, List

from app.models import StrategyInfo

from .base import BaseStrategy
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
