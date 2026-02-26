from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging

import pandas as pd
import yfinance as yf

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    value: object
    expires_at: datetime


class YFinanceClient:
    """yfinance wrapper with lightweight in-memory caching."""

    def __init__(self):
        self._history_cache: Dict[str, CacheEntry] = {}
        self._info_cache: Dict[str, CacheEntry] = {}
        self._benchmark_cache: Dict[str, CacheEntry] = {}
        self._history_ttl = timedelta(minutes=15)
        self._info_ttl = timedelta(hours=2)

    def _is_fresh(self, entry: Optional[CacheEntry]) -> bool:
        return bool(entry and entry.expires_at > datetime.now())

    def _normalize_symbol(self, symbol: str) -> str:
        # Yahoo commonly uses '-' where brokers/frontends may use '.'
        return symbol.strip().upper().replace(".", "-")

    @staticmethod
    def _normalize_sector_name(raw: str) -> str:
        """Convert snake_case benchmark sector keys to Title Case to match Ticker.info format."""
        return raw.replace("_", " ").title().replace("Realestate", "Real Estate")

    def get_historical_prices(self, symbols: List[str], period_days: int = 365) -> pd.DataFrame:
        original_symbols = sorted({s.strip().upper() for s in symbols if s and s.strip()})
        symbols = sorted({self._normalize_symbol(s) for s in original_symbols})
        if not symbols:
            return pd.DataFrame()

        cache_key = f"{'-'.join(symbols)}_{period_days}"
        cached = self._history_cache.get(cache_key)
        if self._is_fresh(cached):
            return cached.value.copy()  # type: ignore[return-value]

        data = pd.DataFrame()
        for days in [period_days, max(120, period_days // 2), 90]:
            data = yf.download(
                tickers=symbols,
                period=f"{days}d",
                interval="1d",
                auto_adjust=True,
                progress=False,
                group_by="column",
                threads=True,
            )
            if not data.empty:
                break

        if data.empty:
            return pd.DataFrame()

        if isinstance(data.columns, pd.MultiIndex):
            prices = data["Close"].copy() if "Close" in data.columns.get_level_values(0) else pd.DataFrame()
        else:
            if "Close" in data.columns:
                prices = data[["Close"]].rename(columns={"Close": symbols[0]})
            elif "Adj Close" in data.columns:
                prices = data[["Adj Close"]].rename(columns={"Adj Close": symbols[0]})
            else:
                prices = pd.DataFrame()

        if prices.empty:
            return pd.DataFrame()

        if isinstance(prices, pd.Series):
            prices = prices.to_frame(name=symbols[0])

        prices = prices.sort_index().ffill(limit=5)

        valid_symbols = []
        min_data_points = 30
        for symbol in prices.columns:
            if prices[symbol].dropna().shape[0] >= min_data_points:
                valid_symbols.append(symbol)
            else:
                logger.warning("Dropping %s due to insufficient historical rows", symbol)

        if not valid_symbols:
            return pd.DataFrame()

        filtered = prices[valid_symbols].dropna(how="all")
        # Map back normalized Yahoo symbols to requested symbols when possible.
        reverse_map = {self._normalize_symbol(s): s for s in original_symbols}
        filtered = filtered.rename(columns={c: reverse_map.get(c, c) for c in filtered.columns})
        filtered.columns.name = None  # Strip yfinance metadata label (e.g. "Ticker")
        self._history_cache[cache_key] = CacheEntry(filtered.copy(), datetime.now() + self._history_ttl)
        return filtered

    def get_stock_info(self, symbol: str) -> Dict:
        symbol = self._normalize_symbol(symbol)
        cached = self._info_cache.get(symbol)
        if self._is_fresh(cached):
            return dict(cached.value)  # type: ignore[arg-type]

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            cleaned = {
                "symbol": symbol,
                "longName": info.get("longName") or info.get("shortName") or symbol,
                "sector": info.get("sector") or "Other",
                "exchange": info.get("exchange") or "",
                "marketCap": info.get("marketCap"),
                "trailingPE": info.get("trailingPE"),
                "forwardPE": info.get("forwardPE"),
            }
            self._info_cache[symbol] = CacheEntry(cleaned, datetime.now() + self._info_ttl)
            return cleaned
        except Exception as exc:
            logger.warning("Failed to fetch stock info for %s: %s", symbol, exc)
            return {
                "symbol": symbol,
                "longName": symbol,
                "sector": "Other",
                "exchange": "",
                "marketCap": None,
                "trailingPE": None,
                "forwardPE": None,
            }

    def get_momentum(self, symbol: str, months: int = 6) -> Optional[float]:
        symbol = self._normalize_symbol(symbol)
        lookback_days = max(60, int(months * 30.5))
        prices = self.get_historical_prices([symbol], period_days=lookback_days + 10)
        if prices.empty or symbol not in prices.columns:
            return None

        series = prices[symbol].dropna()
        if len(series) < 30:
            return None

        start_price = float(series.iloc[0])
        end_price = float(series.iloc[-1])
        if start_price <= 0:
            return None
        return (end_price / start_price) - 1.0

    def get_latest_close(self, symbol: str) -> Optional[float]:
        symbol = self._normalize_symbol(symbol)
        prices = self.get_historical_prices([symbol], period_days=10)
        if prices.empty or symbol not in prices.columns:
            return None
        series = prices[symbol].dropna()
        return float(series.iloc[-1]) if not series.empty else None

    def get_benchmark_sector_weights(self, benchmark_symbol: Optional[str] = None) -> Dict[str, float]:
        symbol = (benchmark_symbol or settings.benchmark_symbol).upper()
        cached = self._benchmark_cache.get(symbol)
        if self._is_fresh(cached):
            return dict(cached.value)  # type: ignore[arg-type]

        weights: Dict[str, float] = {}
        try:
            ticker = yf.Ticker(symbol)
            funds_data = getattr(ticker, "funds_data", None)
            sector_weightings = getattr(funds_data, "sector_weightings", None) if funds_data else None
            if isinstance(sector_weightings, dict):
                total = sum(float(v) for v in sector_weightings.values() if v is not None)
                if total > 0:
                    weights = {
                        self._normalize_sector_name(k): float(v) / total
                        for k, v in sector_weightings.items()
                        if v is not None
                    }
        except Exception as exc:
            logger.warning("Failed to fetch dynamic benchmark sector weights for %s: %s", symbol, exc)

        self._benchmark_cache[symbol] = CacheEntry(weights, datetime.now() + self._info_ttl)
        return weights

    def get_benchmark_constituents(self, benchmark_symbol: Optional[str] = None, limit: int = 200) -> List[str]:
        symbol = (benchmark_symbol or settings.benchmark_symbol).upper()
        symbols: List[str] = []
        try:
            ticker = yf.Ticker(symbol)
            funds_data = getattr(ticker, "funds_data", None)
            top_holdings = getattr(funds_data, "top_holdings", None) if funds_data else None
            if isinstance(top_holdings, pd.DataFrame) and "Symbol" in top_holdings.columns:
                symbols = [s for s in top_holdings["Symbol"].dropna().astype(str).str.upper().tolist() if s]
            elif isinstance(top_holdings, dict):
                symbols = [str(s).upper() for s in top_holdings.keys()]
        except Exception as exc:
            logger.warning("Failed to fetch benchmark constituents for %s: %s", symbol, exc)

        deduped = []
        seen = set()
        for s in symbols:
            if s not in seen:
                deduped.append(s)
                seen.add(s)
            if len(deduped) >= limit:
                break
        return deduped


yfinance_client = YFinanceClient()
