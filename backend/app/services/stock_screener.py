from __future__ import annotations

from typing import Dict, List, Optional
import logging

import numpy as np
import pandas as pd

from app.config import settings
from app.external.yfinance_client import yfinance_client

logger = logging.getLogger(__name__)


class StockScreener:
    def __init__(self):
        self._sector_cache: Dict[str, str] = {}

    def get_sector_for_symbol(self, symbol: str) -> str:
        symbol = symbol.upper()
        if symbol in self._sector_cache:
            return self._sector_cache[symbol]

        info = yfinance_client.get_stock_info(symbol)
        sector = (info.get("sector") or "Other").strip() or "Other"
        self._sector_cache[symbol] = sector
        return sector

    def batch_get_sector(self, symbols: List[str]) -> Dict[str, str]:
        result = {}
        for symbol in symbols:
            result[symbol] = self.get_sector_for_symbol(symbol)
        return result

    def _get_sector_universe(self, sector: str, max_size: int = 60) -> List[str]:
        benchmark_symbols = yfinance_client.get_benchmark_constituents(limit=300)
        if not benchmark_symbols:
            return []

        sector_matches = []
        for symbol in benchmark_symbols:
            if self.get_sector_for_symbol(symbol) == sector:
                sector_matches.append(symbol)
            if len(sector_matches) >= max_size:
                break

        return sector_matches

    def get_candidates_for_sector(
        self,
        sector: str,
        existing_symbols: List[str],
        existing_prices_df: pd.DataFrame,
        max_candidates: int = 5,
    ) -> List[Dict]:
        universe = [s for s in self._get_sector_universe(sector) if s not in set(existing_symbols)]
        if not universe:
            return []

        probe = universe[:15]
        candidates_prices = yfinance_client.get_historical_prices(probe, period_days=365)
        if candidates_prices.empty:
            return []

        result: List[Dict] = []
        base_returns = existing_prices_df.pct_change().dropna() if not existing_prices_df.empty else pd.DataFrame()

        for symbol in candidates_prices.columns:
            try:
                series = candidates_prices[symbol].dropna()
                if len(series) < 80:
                    continue

                candidate_returns = series.pct_change().dropna()
                corr_fit_score = self._score_correlation_fit(candidate_returns, base_returns)
                momentum = yfinance_client.get_momentum(symbol, months=6) or 0.0
                momentum_score = max(0.0, min(1.0, (momentum + 0.2) / 0.5)) * settings.score_weight_momentum

                info = yfinance_client.get_stock_info(symbol)
                fundamentals_score = self._score_fundamentals(info)
                sector_bonus = settings.score_weight_sector_gap

                total = corr_fit_score + momentum_score + fundamentals_score + sector_bonus

                result.append(
                    {
                        "symbol": symbol,
                        "name": info.get("longName") or symbol,
                        "sector": info.get("sector") or sector,
                        "exchange": info.get("exchange") or "",
                        "score": float(total),
                        "metrics": {
                            "correlation_fit": round(corr_fit_score, 3),
                            "momentum_6m": round(momentum, 4),
                            "trailing_pe": info.get("trailingPE"),
                            "market_cap": info.get("marketCap"),
                        },
                    }
                )
            except Exception as exc:
                logger.warning("Failed candidate scoring for %s: %s", symbol, exc)

        result.sort(key=lambda x: x["score"], reverse=True)
        return result[:max_candidates]

    def _score_correlation_fit(self, candidate_returns: pd.Series, base_returns: pd.DataFrame) -> float:
        if base_returns.empty:
            return settings.score_weight_correlation * 0.5

        scores = []
        for symbol in base_returns.columns:
            aligned = pd.concat([candidate_returns, base_returns[symbol]], axis=1).dropna()
            if len(aligned) < 50:
                continue
            corr = float(aligned.iloc[:, 0].corr(aligned.iloc[:, 1]))
            if np.isnan(corr):
                continue
            scores.append(abs(corr))

        if not scores:
            return settings.score_weight_correlation * 0.5

        avg_abs_corr = float(np.mean(scores))
        fit = 1.0 - min(1.0, avg_abs_corr)
        return fit * settings.score_weight_correlation

    def _score_fundamentals(self, info: Dict) -> float:
        score = 0.0
        pe = info.get("trailingPE")
        mcap = info.get("marketCap")

        if isinstance(pe, (float, int)) and pe > 0:
            if 8 <= pe <= 30:
                score += settings.score_weight_fundamentals * 0.6
            elif pe <= 45:
                score += settings.score_weight_fundamentals * 0.35

        if isinstance(mcap, (float, int)) and mcap > 0:
            # Smoothly reward larger-cap liquidity profile.
            size_component = min(1.0, np.log10(float(mcap)) / 13.0)
            score += settings.score_weight_fundamentals * 0.4 * size_component

        return float(min(settings.score_weight_fundamentals, score))


stock_screener = StockScreener()
