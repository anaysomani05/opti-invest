from __future__ import annotations

import logging
from typing import Any, Dict, List

import pandas as pd

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)

# Sector average P/E ratios (approximate)
SECTOR_PE_AVERAGES: Dict[str, float] = {
    "Technology": 30.0,
    "Healthcare": 22.0,
    "Financial Services": 15.0,
    "Financials": 15.0,
    "Consumer Cyclical": 20.0,
    "Consumer Defensive": 22.0,
    "Industrials": 20.0,
    "Energy": 12.0,
    "Utilities": 18.0,
    "Real Estate": 35.0,
    "Communication Services": 18.0,
    "Basic Materials": 15.0,
}


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        v = float(val)
        return v if v == v else default  # NaN check
    except (TypeError, ValueError):
        return default


class FundamentalAgent(BaseAgent):
    name = "fundamental"

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        import yfinance as yf

        signals = []
        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info or {}
                signal = self._score_stock(symbol, info)
                signals.append(signal)
            except Exception as exc:
                logger.warning("Fundamental analysis failed for %s: %s", symbol, exc)
                signals.append({
                    "symbol": symbol,
                    "score": 0.5,
                    "valuation": "fair",
                    "metrics": {},
                    "summary": f"Unable to fetch fundamentals: {exc}",
                })

        return {"signals": signals}

    def _score_stock(self, symbol: str, info: Dict[str, Any]) -> Dict[str, Any]:
        trailing_pe = _safe_float(info.get("trailingPE"))
        forward_pe = _safe_float(info.get("forwardPE"))
        peg = _safe_float(info.get("pegRatio"))
        revenue_growth = _safe_float(info.get("revenueGrowth"))
        earnings_growth = _safe_float(info.get("earningsGrowth"))
        debt_to_equity = _safe_float(info.get("debtToEquity"))
        roe = _safe_float(info.get("returnOnEquity"))
        fcf = _safe_float(info.get("freeCashflow"))
        market_cap = _safe_float(info.get("marketCap"))
        profit_margin = _safe_float(info.get("profitMargins"))
        sector = info.get("sector", "Other")

        scores = []

        # 1. Valuation score (P/E relative to sector)
        sector_pe = SECTOR_PE_AVERAGES.get(sector, 20.0)
        if trailing_pe > 0:
            pe_ratio = trailing_pe / sector_pe
            if pe_ratio < 0.7:
                scores.append(0.9)
            elif pe_ratio < 1.0:
                scores.append(0.7)
            elif pe_ratio < 1.3:
                scores.append(0.5)
            else:
                scores.append(0.3)
        else:
            scores.append(0.5)

        # 2. Growth score
        growth = max(revenue_growth, earnings_growth) if (revenue_growth or earnings_growth) else 0
        if growth > 0.20:
            scores.append(0.9)
        elif growth > 0.10:
            scores.append(0.7)
        elif growth > 0:
            scores.append(0.5)
        else:
            scores.append(0.3)

        # 3. Financial health (debt/equity)
        if debt_to_equity > 0:
            if debt_to_equity < 50:
                scores.append(0.9)
            elif debt_to_equity < 100:
                scores.append(0.7)
            elif debt_to_equity < 200:
                scores.append(0.4)
            else:
                scores.append(0.2)
        else:
            scores.append(0.5)

        # 4. Profitability (ROE + margins)
        if roe > 0.20:
            scores.append(0.9)
        elif roe > 0.10:
            scores.append(0.7)
        elif roe > 0:
            scores.append(0.5)
        else:
            scores.append(0.3)

        # 5. Forward P/E discount (earnings expected to improve)
        if forward_pe > 0 and trailing_pe > 0:
            if forward_pe < trailing_pe * 0.85:
                scores.append(0.8)
            elif forward_pe < trailing_pe:
                scores.append(0.6)
            else:
                scores.append(0.4)
        else:
            scores.append(0.5)

        overall = sum(scores) / len(scores) if scores else 0.5

        # Classify valuation
        if overall >= 0.7:
            valuation = "undervalued"
        elif overall >= 0.45:
            valuation = "fair"
        else:
            valuation = "overvalued"

        metrics = {
            "trailing_pe": round(trailing_pe, 2) if trailing_pe else None,
            "forward_pe": round(forward_pe, 2) if forward_pe else None,
            "peg_ratio": round(peg, 2) if peg else None,
            "revenue_growth": round(revenue_growth * 100, 1) if revenue_growth else None,
            "earnings_growth": round(earnings_growth * 100, 1) if earnings_growth else None,
            "debt_to_equity": round(debt_to_equity, 1) if debt_to_equity else None,
            "roe": round(roe * 100, 1) if roe else None,
            "profit_margin": round(profit_margin * 100, 1) if profit_margin else None,
            "market_cap": market_cap,
            "sector": sector,
        }

        summary_parts = []
        if valuation == "undervalued":
            summary_parts.append(f"{symbol} appears undervalued")
        elif valuation == "overvalued":
            summary_parts.append(f"{symbol} appears overvalued")
        else:
            summary_parts.append(f"{symbol} is fairly valued")

        if trailing_pe > 0:
            summary_parts.append(f"P/E {trailing_pe:.1f} vs sector avg {sector_pe:.0f}")
        if revenue_growth:
            summary_parts.append(f"revenue growth {revenue_growth*100:.1f}%")

        return {
            "symbol": symbol,
            "score": round(overall, 3),
            "valuation": valuation,
            "metrics": metrics,
            "summary": ". ".join(summary_parts) + ".",
        }
