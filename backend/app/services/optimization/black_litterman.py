from __future__ import annotations

import logging
from typing import Any, Dict

import pandas as pd
from pypfopt import EfficientFrontier, black_litterman, risk_models

from app.models import StrategyConfig
from app.external.yfinance_client import yfinance_client
from .base import BaseStrategy

logger = logging.getLogger(__name__)


class BlackLittermanStrategy(BaseStrategy):
    id = "black_litterman"
    name = "Black-Litterman"
    description = "Starts from market-equilibrium returns (market-cap implied). More stable than raw mean-variance."
    best_for = "Institutional-grade, stable allocations"
    uses_expected_returns = True
    supports_weight_bounds = True

    def optimize(self, prices: pd.DataFrame, config: StrategyConfig) -> Dict[str, float]:
        symbols = list(prices.columns)
        S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()

        market_caps = self._get_market_caps(symbols)

        # Compute market-implied equilibrium returns (no views)
        implied_returns = black_litterman.market_implied_prior_returns(
            market_caps, config.risk_aversion, S
        )

        ef = EfficientFrontier(implied_returns, S)
        ef.add_constraint(lambda w: w >= config.min_weight)
        ef.add_constraint(lambda w: w <= config.max_weight)
        ef.max_sharpe(risk_free_rate=config.risk_free_rate)

        weights = ef.clean_weights(cutoff=0.005)
        total = sum(weights.values())
        if total > 0:
            weights = {s: w / total for s, w in weights.items()}
        return weights

    def _get_market_caps(self, symbols: list) -> Dict[str, float]:
        caps = {}
        for sym in symbols:
            try:
                info = yfinance_client.get_stock_info(sym)
                caps[sym] = info.get("marketCap", 1e9) or 1e9
            except Exception:
                caps[sym] = 1e9
        return caps

    def get_metadata(self) -> Dict[str, Any]:
        return {"method": "black_litterman_market_prior", "views": "none (market equilibrium only)"}
