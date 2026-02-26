"""
Discovery Engine — finds new stock candidates in underweight sectors,
enriched with quick sentiment + fundamental scores from agent outputs.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.stock_screener import stock_screener
from app.external.yfinance_client import yfinance_client

logger = logging.getLogger(__name__)

# S&P 500 approximate sector weights
BENCHMARK_WEIGHTS: Dict[str, float] = {
    "Technology": 0.30,
    "Healthcare": 0.13,
    "Financial Services": 0.13,
    "Consumer Cyclical": 0.10,
    "Communication Services": 0.09,
    "Industrials": 0.08,
    "Consumer Defensive": 0.06,
    "Energy": 0.04,
    "Utilities": 0.03,
    "Real Estate": 0.02,
    "Basic Materials": 0.02,
}


def discover_candidates(
    symbols: List[str],
    current_weights: Dict[str, float],
    sentiment_data: Optional[Dict[str, Any]] = None,
    fundamental_data: Optional[Dict[str, Any]] = None,
    max_candidates: int = 6,
) -> List[Dict[str, Any]]:
    """Find stocks NOT in portfolio that fill sector gaps."""

    # Determine current sector allocation
    sector_map = stock_screener.batch_get_sector(symbols)
    sector_weights: Dict[str, float] = {}
    for sym, w in current_weights.items():
        sec = sector_map.get(sym, "Other")
        sector_weights[sec] = sector_weights.get(sec, 0) + w

    # Find underweight sectors
    gaps: List[tuple] = []
    for sector, bench_w in BENCHMARK_WEIGHTS.items():
        cur_w = sector_weights.get(sector, 0)
        gap = bench_w - cur_w
        if gap > 0.02:  # at least 2% underweight
            gaps.append((sector, gap))

    gaps.sort(key=lambda g: g[1], reverse=True)

    if not gaps:
        logger.info("No significant sector gaps found.")
        return []

    # Fetch historical prices for correlation scoring
    try:
        hist_prices = yfinance_client.get_historical_prices(symbols, period_days=365)
    except Exception:
        hist_prices = None

    candidates: List[Dict[str, Any]] = []
    seen_symbols: set = set(symbols)

    for sector, gap in gaps[:3]:
        try:
            raw = stock_screener.get_candidates_for_sector(
                sector=sector,
                existing_symbols=list(seen_symbols),
                existing_prices_df=hist_prices if hist_prices is not None else __import__("pandas").DataFrame(),
                max_candidates=3,
            )
        except Exception as exc:
            logger.warning("Screener failed for sector %s: %s", sector, exc)
            continue

        for c in raw:
            sym = c["symbol"]
            if sym in seen_symbols:
                continue
            seen_symbols.add(sym)

            reason = f"Fills {sector} gap ({gap:.0%} underweight)"

            candidates.append({
                "symbol": sym,
                "name": c.get("name", sym),
                "sector": c.get("sector", sector),
                "score": round(c.get("score", 0), 2),
                "reason": reason,
                "metrics": c.get("metrics", {}),
            })

    # Sort by score and trim
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates[:max_candidates]
