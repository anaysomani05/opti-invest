from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)

try:
    from pypfopt import BlackLittermanModel, EfficientFrontier, expected_returns, risk_models
except ImportError:
    BlackLittermanModel = None  # type: ignore[assignment, misc]


class BlackLittermanOptimizer:
    """Convert agent outputs into BL views and run optimization."""

    def optimize(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
        sentiment_data: Optional[Dict[str, Any]] = None,
        fundamental_data: Optional[Dict[str, Any]] = None,
        risk_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if BlackLittermanModel is None:
            return self._fallback_optimize(symbols, historical_prices, current_weights)

        try:
            views, confidences, view_sources = self._build_views(
                symbols, sentiment_data, fundamental_data, risk_data
            )
            if not views:
                logger.info("No BL views generated, falling back to standard optimization")
                return self._fallback_optimize(symbols, historical_prices, current_weights)

            return self._run_bl(
                symbols, historical_prices, market_caps, current_weights,
                views, confidences, view_sources,
            )
        except Exception as exc:
            logger.exception("BL optimization failed: %s", exc)
            return self._fallback_optimize(symbols, historical_prices, current_weights)

    def _build_views(
        self,
        symbols: List[str],
        sentiment_data: Optional[Dict[str, Any]],
        fundamental_data: Optional[Dict[str, Any]],
        risk_data: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, List[str]]]:
        """Aggregate agent signals into per-stock BL views."""
        raw_views: Dict[str, List[Tuple[float, float, str]]] = {s: [] for s in symbols}

        # Sentiment views: score (-1 to +1) → ±5% excess return
        if sentiment_data:
            for item in sentiment_data.get("sentiments", []):
                sym = item.get("symbol", "")
                if sym in raw_views:
                    score = float(item.get("score", 0))
                    conf = float(item.get("confidence", 0.5))
                    excess = score * 0.05
                    raw_views[sym].append((excess, conf, "sentiment"))

        # Fundamental views: undervalued +3%, fair 0%, overvalued -3%
        if fundamental_data:
            val_map = {"undervalued": 0.03, "fair": 0.0, "overvalued": -0.03}
            for item in fundamental_data.get("signals", []):
                sym = item.get("symbol", "")
                if sym in raw_views:
                    valuation = item.get("valuation", "fair")
                    excess = val_map.get(valuation, 0.0)
                    fund_score = float(item.get("score", 0.5))
                    conf = max(0.3, min(0.9, fund_score))
                    raw_views[sym].append((excess, conf, "fundamental"))

        # Risk views: high risk → negative view
        if risk_data:
            per_stock_risk = risk_data.get("per_stock_risk", {})
            if per_stock_risk:
                avg_risk = sum(per_stock_risk.values()) / len(per_stock_risk) if per_stock_risk else 0.2
                for sym in symbols:
                    vol = per_stock_risk.get(sym, avg_risk)
                    if vol > avg_risk * 1.5:
                        excess = -0.02 * (vol / avg_risk)
                        raw_views[sym].append((excess, 0.4, "risk"))

        # Aggregate views per stock
        final_views: Dict[str, float] = {}
        final_conf: Dict[str, float] = {}
        final_sources: Dict[str, List[str]] = {}

        for sym, entries in raw_views.items():
            if not entries:
                continue
            total_weight = sum(c for _, c, _ in entries)
            if total_weight <= 0:
                continue
            weighted_view = sum(v * c for v, c, _ in entries) / total_weight
            avg_conf = total_weight / len(entries)

            # Multi-agent agreement boost
            source_names = list(set(s for _, _, s in entries))
            if len(source_names) >= 2:
                avg_conf = min(1.0, avg_conf * 1.2)

            if abs(weighted_view) > 0.001:
                final_views[sym] = weighted_view
                final_conf[sym] = avg_conf
                final_sources[sym] = source_names

        return final_views, final_conf, final_sources

    def _run_bl(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
        views: Dict[str, float],
        confidences: Dict[str, float],
        view_sources: Dict[str, List[str]],
    ) -> Dict[str, Any]:
        prices = historical_prices[[s for s in symbols if s in historical_prices.columns]]
        if prices.empty:
            return self._fallback_optimize(symbols, historical_prices, current_weights)

        mu = expected_returns.ema_historical_return(prices)
        S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()

        # Build absolute views
        viewdict = {sym: views[sym] for sym in views if sym in mu.index}
        if not viewdict:
            return self._fallback_optimize(symbols, historical_prices, current_weights)

        # Confidence → omega (uncertainty matrix)
        # Lower confidence = higher uncertainty = less BL influence
        omega_diag = []
        view_symbols = list(viewdict.keys())
        for sym in view_symbols:
            conf = confidences.get(sym, 0.5)
            idx = mu.index.get_loc(sym)
            var = S.iloc[idx, idx]
            uncertainty = var * (1.0 / max(conf, 0.1))
            omega_diag.append(uncertainty)

        omega = np.diag(omega_diag)

        # Filter market caps to available symbols
        mcaps = {s: market_caps.get(s, 1e9) for s in mu.index}

        bl = BlackLittermanModel(
            S,
            pi="market",
            market_caps=mcaps,
            risk_aversion=settings.bl_risk_aversion,
            absolute_views=viewdict,
            omega=omega,
        )

        bl_returns = bl.bl_returns()
        bl_cov = bl.bl_cov()

        # Run efficient frontier on BL-adjusted returns
        ef = EfficientFrontier(bl_returns, bl_cov)
        for sym in ef.tickers:
            idx = list(ef.tickers).index(sym)
            ef.add_constraint(lambda w, i=idx: w[i] >= 0.01)
            ef.add_constraint(lambda w, i=idx: w[i] <= 0.40)

        ef.max_sharpe(risk_free_rate=settings.bl_risk_free_rate)
        cleaned = ef.clean_weights(cutoff=0.005)
        perf = ef.portfolio_performance(risk_free_rate=settings.bl_risk_free_rate)

        optimal_weights = dict(cleaned)

        # Build views list for frontend
        bl_views = []
        for sym in view_symbols:
            bl_views.append({
                "symbol": sym,
                "expected_excess_return": round(views[sym], 4),
                "confidence": round(confidences.get(sym, 0.5), 3),
                "sources": view_sources.get(sym, []),
            })

        return {
            "optimal_weights": {k: round(v, 4) for k, v in optimal_weights.items()},
            "expected_return": round(float(perf[0]), 4),
            "volatility": round(float(perf[1]), 4),
            "sharpe_ratio": round(float(perf[2]), 4),
            "views": bl_views,
            "current_weights": current_weights,
            "method": "black_litterman",
        }

    def _fallback_optimize(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        """Standard EF optimization without BL views."""
        try:
            prices = historical_prices[[s for s in symbols if s in historical_prices.columns]]
            if prices.empty or len(prices.columns) < 2:
                equal = 1.0 / len(symbols)
                return {
                    "optimal_weights": {s: round(equal, 4) for s in symbols},
                    "expected_return": 0.0,
                    "volatility": 0.0,
                    "sharpe_ratio": 0.0,
                    "views": [],
                    "current_weights": current_weights,
                    "method": "equal_weight_fallback",
                }

            mu = expected_returns.ema_historical_return(prices)
            S = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
            ef = EfficientFrontier(mu, S)
            ef.max_sharpe(risk_free_rate=settings.bl_risk_free_rate)
            cleaned = ef.clean_weights(cutoff=0.005)
            perf = ef.portfolio_performance(risk_free_rate=settings.bl_risk_free_rate)

            return {
                "optimal_weights": {k: round(v, 4) for k, v in dict(cleaned).items()},
                "expected_return": round(float(perf[0]), 4),
                "volatility": round(float(perf[1]), 4),
                "sharpe_ratio": round(float(perf[2]), 4),
                "views": [],
                "current_weights": current_weights,
                "method": "efficient_frontier_fallback",
            }
        except Exception as exc:
            logger.exception("Fallback optimization also failed: %s", exc)
            equal = 1.0 / max(1, len(symbols))
            return {
                "optimal_weights": {s: round(equal, 4) for s in symbols},
                "expected_return": 0.0,
                "volatility": 0.0,
                "sharpe_ratio": 0.0,
                "views": [],
                "current_weights": current_weights,
                "method": "equal_weight_fallback",
            }
