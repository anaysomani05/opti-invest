from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict

import pandas as pd

from app.models import StrategyConfig


class BaseStrategy(ABC):
    id: str
    name: str
    description: str
    best_for: str
    uses_expected_returns: bool = True
    supports_weight_bounds: bool = True

    @abstractmethod
    def optimize(
        self, prices: pd.DataFrame, config: StrategyConfig
    ) -> Dict[str, float]:
        """Return {symbol: weight} dict."""
        ...

    def get_metadata(self) -> Dict[str, Any]:
        return {}
