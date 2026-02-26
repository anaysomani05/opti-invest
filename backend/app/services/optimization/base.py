from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from pypfopt import expected_returns, risk_models

from app.models import EfficientFrontierPoint, HoldingWithMetrics, StrategyConfig

logger = logging.getLogger(__name__)


def calculate_current_weights(holdings: List[HoldingWithMetrics]) -> Dict[str, float]:
    total_value = sum(h.value for h in holdings)
    if total_value <= 0:
        raise ValueError("Portfolio has no value")
    return {h.symbol: h.value / total_value for h in holdings}


def calculate_portfolio_metrics(
    weights: Dict[str, float],
    mu: pd.Series,
    S: pd.DataFrame,
    risk_free_rate: float = 0.04,
) -> Dict[str, float]:
    w = np.array([weights.get(s, 0) for s in mu.index])
    exp_ret = float(np.dot(w, mu.values))
    vol = float(np.sqrt(np.dot(w.T, np.dot(S.values, w))))
    sharpe = (exp_ret - risk_free_rate) / vol if vol > 0 else 0.0
    return {"expected_return": exp_ret, "volatility": vol, "sharpe_ratio": sharpe}


def calculate_max_drawdown(
    historical_data: pd.DataFrame, weights: Dict[str, float]
) -> Optional[float]:
    try:
        returns = historical_data.pct_change().dropna()
        w = np.array([weights.get(s, 0) for s in returns.columns])
        port_ret = returns.dot(w)
        cumulative = (1 + port_ret).cumprod()
        running_max = cumulative.expanding().max()
        drawdowns = (cumulative - running_max) / running_max
        return float(abs(drawdowns.min()))
    except Exception:
        return None


def calculate_cvar(
    historical_data: pd.DataFrame,
    weights: Dict[str, float],
    confidence: float = 0.05,
) -> Optional[float]:
    try:
        returns = historical_data.pct_change().dropna()
        w = np.array([weights.get(s, 0) for s in returns.columns])
        port_ret = returns.dot(w)
        var = np.percentile(port_ret, confidence * 100)
        cvar_returns = port_ret[port_ret <= var]
        cvar = cvar_returns.mean() if len(cvar_returns) > 0 else var
        return float(abs(cvar * np.sqrt(252)))
    except Exception:
        return None


def calculate_rebalancing_trades(
    current_weights: Dict[str, float],
    optimal_weights: Dict[str, float],
    holdings: List[HoldingWithMetrics],
) -> Dict[str, float]:
    total_value = sum(h.value for h in holdings)
    trades = {}
    for symbol in set(list(current_weights.keys()) + list(optimal_weights.keys())):
        diff = optimal_weights.get(symbol, 0) - current_weights.get(symbol, 0)
        dollar = diff * total_value
        if abs(dollar) > total_value * 0.01:
            trades[symbol] = dollar
    return trades


def generate_efficient_frontier(
    mu: pd.Series, S: pd.DataFrame, risk_free_rate: float = 0.04, num_points: int = 20
) -> List[EfficientFrontierPoint]:
    from pypfopt import EfficientFrontier as EF

    try:
        points: List[EfficientFrontierPoint] = []
        min_ret = float(mu.min()) * 0.1
        max_ret = float(mu.max()) * 2.0
        targets = np.linspace(min_ret, max_ret, num_points)

        for target in targets:
            try:
                ef = EF(mu, S)
                ef.add_constraint(lambda w: w >= 0.001)
                ef.add_constraint(lambda w: w <= 0.95)
                ef.efficient_return(float(target))
                cleaned = ef.clean_weights(cutoff=0.0001)
                m = calculate_portfolio_metrics(cleaned, mu, S, risk_free_rate)
                points.append(
                    EfficientFrontierPoint(
                        expected_return=m["expected_return"],
                        volatility=m["volatility"],
                        sharpe_ratio=m["sharpe_ratio"],
                        weights=cleaned,
                    )
                )
            except Exception:
                continue

        seen = set()
        unique = []
        for p in points:
            key = (round(p.expected_return, 4), round(p.volatility, 4))
            if key not in seen:
                seen.add(key)
                unique.append(p)
        unique.sort(key=lambda x: x.volatility)
        return unique
    except Exception:
        return []


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
