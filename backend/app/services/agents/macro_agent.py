from __future__ import annotations

import logging
from typing import Any, Dict, List

import pandas as pd
import yfinance as yf

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)

SECTOR_ETFS: Dict[str, str] = {
    "Technology": "XLK",
    "Financials": "XLF",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
}


def _pct_return(series: pd.Series, days: int) -> float:
    clean = series.dropna()
    if len(clean) < days:
        return 0.0
    start = float(clean.iloc[-min(days, len(clean))])
    end = float(clean.iloc[-1])
    return (end / start - 1) if start > 0 else 0.0


class MacroAgent(BaseAgent):
    name = "macro"

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        etf_symbols = list(SECTOR_ETFS.values()) + ["^VIX", "^TNX"]

        try:
            data = yf.download(
                tickers=etf_symbols,
                period="120d",
                interval="1d",
                auto_adjust=True,
                progress=False,
                group_by="column",
                threads=True,
            )
        except Exception as exc:
            logger.warning("Macro data download failed: %s", exc)
            return {"macro_summary": f"Failed to fetch macro data: {exc}"}

        if data.empty:
            return {"macro_summary": "No macro data available."}

        if isinstance(data.columns, pd.MultiIndex):
            prices = data["Close"] if "Close" in data.columns.get_level_values(0) else pd.DataFrame()
        else:
            prices = data

        # VIX
        vix_val = None
        vix_trend = "stable"
        if "^VIX" in prices.columns:
            vix_series = prices["^VIX"].dropna()
            if len(vix_series) >= 2:
                vix_val = round(float(vix_series.iloc[-1]), 2)
                if len(vix_series) >= 20:
                    avg_20 = float(vix_series.iloc[-20:].mean())
                    if vix_val > avg_20 * 1.1:
                        vix_trend = "rising"
                    elif vix_val < avg_20 * 0.9:
                        vix_trend = "falling"

        # Market regime
        if vix_val is not None:
            if vix_val < 15:
                market_regime = "risk_on"
            elif vix_val > 25:
                market_regime = "risk_off"
            else:
                market_regime = "neutral"
        else:
            market_regime = "neutral"

        # 10Y yield
        yield_10y = None
        if "^TNX" in prices.columns:
            tnx = prices["^TNX"].dropna()
            if len(tnx) >= 1:
                yield_10y = round(float(tnx.iloc[-1]), 3)

        # Sector momentum
        sector_data: List[Dict[str, Any]] = []
        for sector, etf in SECTOR_ETFS.items():
            if etf not in prices.columns:
                continue
            series = prices[etf].dropna()
            if len(series) < 22:
                continue
            r1m = _pct_return(series, 22)
            r3m = _pct_return(series, 66)
            signal = "strong" if r3m > 0.05 else ("weak" if r3m < -0.05 else "neutral")
            sector_data.append({
                "sector": sector,
                "etf": etf,
                "return_1m": round(r1m, 4),
                "return_3m": round(r3m, 4),
                "signal": signal,
            })

        sector_data.sort(key=lambda x: x["return_3m"], reverse=True)
        leading = [s["sector"] for s in sector_data[:3]] if len(sector_data) >= 3 else []
        lagging = [s["sector"] for s in sector_data[-3:]] if len(sector_data) >= 3 else []

        # Build summary
        parts = [f"Market regime: {market_regime.replace('_', ' ')}"]
        if vix_val is not None:
            parts.append(f"VIX {vix_val} ({vix_trend})")
        if yield_10y is not None:
            parts.append(f"10Y yield {yield_10y}%")
        if leading:
            parts.append(f"Leading: {', '.join(leading)}")
        if lagging:
            parts.append(f"Lagging: {', '.join(lagging)}")

        return {
            "vix": vix_val,
            "vix_trend": vix_trend,
            "yield_10y": yield_10y,
            "market_regime": market_regime,
            "sector_rotation": sector_data,
            "leading_sectors": leading,
            "lagging_sectors": lagging,
            "macro_summary": ". ".join(parts) + ".",
        }
