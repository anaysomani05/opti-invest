from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Any, Dict, List

import pandas as pd

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


def _safe(val: Any, default=None):
    if val is None:
        return default
    try:
        f = float(val)
        return f if f == f else default  # NaN check
    except (TypeError, ValueError):
        return default


class EarningsAgent(BaseAgent):
    name = "earnings"

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        import yfinance as yf

        earnings_list: List[Dict[str, Any]] = []
        upcoming: List[str] = []
        positive_momentum: List[str] = []

        for symbol in symbols:
            entry: Dict[str, Any] = {"symbol": symbol, "summary": ""}
            try:
                ticker = yf.Ticker(symbol)

                # Next earnings date
                try:
                    cal = ticker.calendar
                    if isinstance(cal, pd.DataFrame) and not cal.empty:
                        next_date = cal.iloc[0, 0] if cal.shape[1] > 0 else None
                    elif isinstance(cal, dict):
                        next_date = cal.get("Earnings Date", [None])[0] if isinstance(cal.get("Earnings Date"), list) else cal.get("Earnings Date")
                    else:
                        next_date = None

                    if next_date is not None:
                        if isinstance(next_date, pd.Timestamp):
                            next_date = next_date.date()
                        elif isinstance(next_date, datetime):
                            next_date = next_date.date()
                        entry["next_earnings_date"] = str(next_date)
                        days = (next_date - date.today()).days
                        entry["days_until_earnings"] = days
                        if 0 < days <= 14:
                            upcoming.append(symbol)
                except Exception:
                    pass

                # Earnings history — beat streak & last surprise
                try:
                    hist = ticker.earnings_history
                    if isinstance(hist, pd.DataFrame) and not hist.empty:
                        surprises = []
                        for _, row in hist.iterrows():
                            actual = _safe(row.get("epsActual"))
                            est = _safe(row.get("epsEstimate"))
                            if actual is not None and est is not None and est != 0:
                                surprises.append((actual - est) / abs(est) * 100)
                        if surprises:
                            entry["last_surprise_pct"] = round(surprises[-1], 2)
                            streak = 0
                            for s in reversed(surprises):
                                if s > 0:
                                    streak += 1
                                else:
                                    break
                            entry["beat_streak"] = streak
                except Exception:
                    pass

                # Analyst price targets
                try:
                    targets = ticker.analyst_price_targets
                    if isinstance(targets, dict):
                        avg_target = _safe(targets.get("mean")) or _safe(targets.get("average"))
                        current = _safe(targets.get("current"))
                        if avg_target and current and current > 0:
                            entry["price_target_upside"] = round((avg_target / current - 1) * 100, 2)
                except Exception:
                    pass

                # Analyst recommendations → consensus
                try:
                    recs = ticker.recommendations
                    if isinstance(recs, pd.DataFrame) and not recs.empty:
                        recent = recs.tail(1).iloc[0]
                        buy = int(_safe(recent.get("strongBuy", 0), 0) or 0) + int(_safe(recent.get("buy", 0), 0) or 0)
                        hold = int(_safe(recent.get("hold", 0), 0) or 0)
                        sell = int(_safe(recent.get("sell", 0), 0) or 0) + int(_safe(recent.get("strongSell", 0), 0) or 0)
                        total = buy + hold + sell
                        if total > 0:
                            if buy / total > 0.6:
                                entry["analyst_consensus"] = "buy"
                            elif sell / total > 0.4:
                                entry["analyst_consensus"] = "sell"
                            else:
                                entry["analyst_consensus"] = "hold"
                except Exception:
                    pass

                # Build summary
                parts = []
                if entry.get("analyst_consensus"):
                    parts.append(f"Consensus: {entry['analyst_consensus'].upper()}")
                if entry.get("beat_streak", 0) >= 3:
                    parts.append(f"{entry['beat_streak']}-quarter beat streak")
                    positive_momentum.append(symbol)
                if entry.get("price_target_upside") is not None:
                    parts.append(f"Target upside: {entry['price_target_upside']:+.1f}%")
                if entry.get("days_until_earnings") is not None and entry["days_until_earnings"] <= 14:
                    parts.append(f"Earnings in {entry['days_until_earnings']}d")
                entry["summary"] = ". ".join(parts) + ("." if parts else "No earnings data available.")

            except Exception as exc:
                logger.warning("Earnings analysis failed for %s: %s", symbol, exc)
                entry["summary"] = f"Failed: {exc}"

            earnings_list.append(entry)

        return {
            "earnings": earnings_list,
            "upcoming": upcoming,
            "positive_momentum": positive_momentum,
        }
