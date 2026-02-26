from __future__ import annotations

import logging
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class RiskAgent(BaseAgent):
    name = "risk"

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        returns = historical_prices.pct_change().dropna(how="all")
        # Forward-fill then drop remaining NaNs to handle stocks with shorter history
        returns = returns.ffill().dropna()
        if returns.empty or len(returns) < 10:
            return self._empty_result()

        weights_arr = np.array([current_weights.get(s, 1.0 / len(symbols)) for s in returns.columns])
        weights_arr = weights_arr / weights_arr.sum()

        portfolio_returns = returns.values @ weights_arr

        # CVaR calculations
        cvar_95 = self._calculate_cvar(portfolio_returns, 0.05)
        cvar_99 = self._calculate_cvar(portfolio_returns, 0.01)

        # Max drawdown
        cumulative = np.cumprod(1 + portfolio_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        max_drawdown = float(np.min(drawdowns)) if len(drawdowns) > 0 else 0.0

        # HHI (concentration)
        hhi = float(np.sum(weights_arr ** 2))

        # Stress tests
        stress_tests = self._run_stress_tests(returns, weights_arr, symbols)

        # Correlation clusters
        correlated_clusters = self._find_clusters(returns)

        # Per-stock risk (annualized volatility)
        per_stock_risk = {}
        for col in returns.columns:
            per_stock_risk[col] = round(float(returns[col].std() * np.sqrt(252)), 4)

        # Hedging suggestions
        hedging = self._hedging_suggestions(hhi, cvar_95, max_drawdown, correlated_clusters)

        return {
            "cvar_95": round(cvar_95, 4),
            "cvar_99": round(cvar_99, 4),
            "max_drawdown": round(max_drawdown, 4),
            "hhi": round(hhi, 4),
            "stress_tests": stress_tests,
            "correlated_clusters": correlated_clusters,
            "hedging_suggestions": hedging,
            "per_stock_risk": per_stock_risk,
        }

    def _calculate_cvar(self, returns: np.ndarray, alpha: float) -> float:
        var = np.percentile(returns, alpha * 100)
        cvar = float(np.mean(returns[returns <= var]))
        return cvar * np.sqrt(252)  # annualize

    def _run_stress_tests(
        self, returns: pd.DataFrame, weights: np.ndarray, symbols: List[str]
    ) -> List[Dict[str, Any]]:
        tests = []
        cols = list(returns.columns)

        # 1. Market crash (-20%)
        betas = {}
        market_return = returns.mean(axis=1)
        for i, col in enumerate(cols):
            cov = np.cov(returns[col].values, market_return.values)
            beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 0 else 1.0
            betas[col] = beta

        crash_impacts = {s: -0.20 * betas.get(s, 1.0) for s in cols}
        portfolio_crash = sum(crash_impacts[s] * weights[i] for i, s in enumerate(cols))
        worst = min(crash_impacts, key=crash_impacts.get)
        best = max(crash_impacts, key=crash_impacts.get)
        tests.append({
            "scenario": "Market Crash (-20%)",
            "portfolio_impact": round(float(portfolio_crash), 4),
            "worst_hit": worst,
            "best_performer": best,
        })

        # 2. Rate hike (+200bps) — approximated: hurts growth, helps financials
        rate_impacts = {}
        for s in cols:
            beta = betas.get(s, 1.0)
            rate_impacts[s] = -0.05 * beta  # higher beta = more rate sensitive
        port_rate = sum(rate_impacts[s] * weights[i] for i, s in enumerate(cols))
        worst_r = min(rate_impacts, key=rate_impacts.get)
        best_r = max(rate_impacts, key=rate_impacts.get)
        tests.append({
            "scenario": "Rate Hike (+200bps)",
            "portfolio_impact": round(float(port_rate), 4),
            "worst_hit": worst_r,
            "best_performer": best_r,
        })

        # 3. Sector rotation — use historical worst monthly return
        monthly_returns = returns.resample("ME").sum() if len(returns) > 20 else returns
        if not monthly_returns.empty:
            worst_month = monthly_returns.values @ weights
            sector_impact = float(np.min(worst_month)) if len(worst_month) > 0 else -0.05
            worst_month_idx = np.argmin(worst_month) if len(worst_month) > 0 else 0
            if worst_month_idx < len(monthly_returns):
                month_row = monthly_returns.iloc[worst_month_idx]
                worst_s = month_row.idxmin() if not month_row.empty else cols[0]
                best_s = month_row.idxmax() if not month_row.empty else cols[0]
            else:
                worst_s, best_s = cols[0], cols[-1]
            tests.append({
                "scenario": "Worst Historical Month",
                "portfolio_impact": round(sector_impact, 4),
                "worst_hit": str(worst_s),
                "best_performer": str(best_s),
            })

        return tests

    def _find_clusters(self, returns: pd.DataFrame) -> List[List[str]]:
        if len(returns.columns) < 3:
            return []
        try:
            corr = returns.corr()
            distance = 1 - corr.abs()
            np.fill_diagonal(distance.values, 0)
            distance = distance.clip(lower=0)
            condensed = squareform(distance.values)
            linkage_matrix = linkage(condensed, method="average")
            labels = fcluster(linkage_matrix, t=0.5, criterion="distance")
            clusters: Dict[int, List[str]] = {}
            for sym, label in zip(returns.columns, labels):
                clusters.setdefault(label, []).append(sym)
            return [c for c in clusters.values() if len(c) >= 2]
        except Exception as exc:
            logger.warning("Clustering failed: %s", exc)
            return []

    def _hedging_suggestions(
        self,
        hhi: float,
        cvar_95: float,
        max_drawdown: float,
        clusters: List[List[str]],
    ) -> List[str]:
        suggestions = []
        if hhi > 0.25:
            suggestions.append("Portfolio is highly concentrated (HHI > 0.25). Consider diversifying across more positions.")
        if cvar_95 < -0.25:
            suggestions.append("Tail risk is elevated (CVaR 95% > 25%). Consider adding defensive positions or hedging with puts.")
        if max_drawdown < -0.30:
            suggestions.append("Historical drawdown exceeds 30%. Consider stop-loss strategies or volatility-targeting.")
        if len(clusters) > 0:
            cluster_str = ", ".join(["/".join(c) for c in clusters[:3]])
            suggestions.append(f"Correlated clusters detected: {cluster_str}. Diversify across uncorrelated assets.")
        if not suggestions:
            suggestions.append("Risk profile appears balanced. Monitor positions for concentration drift.")
        return suggestions

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "cvar_95": 0.0,
            "cvar_99": 0.0,
            "max_drawdown": 0.0,
            "hhi": 0.0,
            "stress_tests": [],
            "correlated_clusters": [],
            "hedging_suggestions": ["Insufficient historical data for risk analysis."],
            "per_stock_risk": {},
        }
