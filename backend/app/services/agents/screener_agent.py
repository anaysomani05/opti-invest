from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .base_agent import BaseAgent
from app.external.yfinance_client import yfinance_client

logger = logging.getLogger(__name__)


class ScreenerAgent(BaseAgent):
    name = "screener"

    def __init__(self, criteria: Optional[Dict[str, Any]] = None):
        super().__init__()
        self.criteria = criteria or {}

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        import yfinance as yf

        target_sectors: List[str] = self.criteria.get("target_sectors", [])
        exclude_symbols = set(symbols)
        max_candidates = self.criteria.get("max_candidates", 8)

        # Get universe from benchmark
        universe = yfinance_client.get_benchmark_constituents(limit=100)
        universe = [s for s in universe if s not in exclude_symbols]

        if not universe:
            return {"candidates": [], "criteria_used": self.criteria}

        candidates: List[Dict[str, Any]] = []

        for symbol in universe[:50]:  # cap at 50 to keep fast
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info or {}
                sector = info.get("sector", "Other")

                # Filter by target sectors if specified
                if target_sectors and sector not in target_sectors:
                    continue

                market_cap = info.get("marketCap")
                if market_cap and market_cap < 2e9:  # min $2B
                    continue

                trailing_pe = info.get("trailingPE")
                if trailing_pe and (trailing_pe < 0 or trailing_pe > 100):
                    continue

                # Score candidate
                score = 0.0
                reasons: List[str] = []
                metrics: Dict[str, Any] = {
                    "sector": sector,
                    "market_cap": market_cap,
                    "trailing_pe": trailing_pe,
                }

                # Sector need (10%)
                if target_sectors and sector in target_sectors:
                    score += 0.10
                    reasons.append(f"Fills {sector} sector gap")

                # Momentum (30%)
                mom = yfinance_client.get_momentum(symbol, months=6)
                if mom is not None:
                    metrics["momentum_6m"] = round(mom * 100, 1)
                    if mom > 0.15:
                        score += 0.30
                        reasons.append("Strong 6m momentum")
                    elif mom > 0.05:
                        score += 0.20
                        reasons.append("Positive momentum")
                    elif mom > -0.05:
                        score += 0.10

                # Fundamentals (20%)
                roe = info.get("returnOnEquity")
                if roe and roe > 0.15:
                    score += 0.15
                    reasons.append(f"High ROE ({roe:.0%})")
                    metrics["roe"] = round(roe * 100, 1)
                elif roe and roe > 0.08:
                    score += 0.10
                    metrics["roe"] = round(roe * 100, 1)

                rev_growth = info.get("revenueGrowth")
                if rev_growth and rev_growth > 0.10:
                    score += 0.05
                    reasons.append(f"Revenue growth {rev_growth:.0%}")
                    metrics["revenue_growth"] = round(rev_growth * 100, 1)

                # Correlation fit (40%) — low correlation to existing portfolio
                try:
                    cand_prices = yfinance_client.get_historical_prices([symbol], period_days=180)
                    if not cand_prices.empty and symbol in cand_prices.columns:
                        common_idx = historical_prices.index.intersection(cand_prices.index)
                        if len(common_idx) >= 30:
                            cand_ret = cand_prices.loc[common_idx, symbol].pct_change().dropna()
                            port_ret = historical_prices.loc[common_idx].pct_change().dropna().mean(axis=1)
                            common = pd.concat([cand_ret, port_ret], axis=1).dropna()
                            if len(common) >= 20:
                                corr = float(np.corrcoef(common.iloc[:, 0], common.iloc[:, 1])[0, 1])
                                metrics["portfolio_correlation"] = round(corr, 3)
                                if corr < 0.3:
                                    score += 0.40
                                    reasons.append("Low correlation — strong diversifier")
                                elif corr < 0.5:
                                    score += 0.25
                                    reasons.append("Moderate diversification benefit")
                                elif corr < 0.7:
                                    score += 0.10
                except Exception:
                    pass

                if not reasons:
                    continue

                candidates.append({
                    "symbol": symbol,
                    "name": info.get("longName") or info.get("shortName") or symbol,
                    "sector": sector,
                    "score": round(score, 3),
                    "reasons": reasons,
                    "metrics": metrics,
                })

            except Exception as exc:
                logger.debug("Screener skipping %s: %s", symbol, exc)
                continue

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return {
            "candidates": candidates[:max_candidates],
            "criteria_used": self.criteria,
        }
