from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

import pandas as pd

from app.config import settings
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)

try:
    import feedparser
except ImportError:
    feedparser = None  # type: ignore[assignment]

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _vader = SentimentIntensityAnalyzer()
except Exception:
    _vader = None


def _fetch_google_news(symbol: str, max_items: int = 10) -> List[str]:
    if not feedparser:
        return []
    try:
        url = f"https://news.google.com/rss/search?q={symbol}+stock&hl=en-US&gl=US&ceid=US:en"
        feed = feedparser.parse(url)
        return [entry.title for entry in feed.entries[:max_items] if hasattr(entry, "title")]
    except Exception as exc:
        logger.warning("Google News RSS failed for %s: %s", symbol, exc)
        return []


def _fetch_yfinance_news(symbol: str, max_items: int = 10) -> List[str]:
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        news = ticker.news or []
        headlines = []
        for item in news[:max_items]:
            title = item.get("title") or item.get("content", {}).get("title", "")
            if title:
                headlines.append(title)
        return headlines
    except Exception as exc:
        logger.warning("yfinance news failed for %s: %s", symbol, exc)
        return []


def _vader_sentiment(headlines: List[str]) -> float:
    if not _vader or not headlines:
        return 0.0
    scores = [_vader.polarity_scores(h)["compound"] for h in headlines]
    return sum(scores) / len(scores)


class SentimentAgent(BaseAgent):
    name = "sentiment"

    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        sentiments = []
        use_gpt = bool(OpenAI and settings.openai_api_key)
        client = OpenAI(api_key=settings.openai_api_key) if use_gpt else None

        for symbol in symbols:
            headlines = _fetch_google_news(symbol) + _fetch_yfinance_news(symbol)
            # Deduplicate
            seen = set()
            unique = []
            for h in headlines:
                if h not in seen:
                    seen.add(h)
                    unique.append(h)
            headlines = unique[:20]

            if not headlines:
                sentiments.append({
                    "symbol": symbol,
                    "score": 0.0,
                    "confidence": 0.1,
                    "headline_count": 0,
                    "catalysts": [],
                    "summary": "No recent news found.",
                })
                continue

            if client:
                try:
                    result = self._gpt_analyze(client, symbol, headlines)
                    sentiments.append(result)
                    continue
                except Exception as exc:
                    logger.warning("GPT sentiment failed for %s, falling back to VADER: %s", symbol, exc)

            # VADER fallback
            score = _vader_sentiment(headlines)
            sentiments.append({
                "symbol": symbol,
                "score": round(score, 3),
                "confidence": min(0.6, len(headlines) / 20),
                "headline_count": len(headlines),
                "catalysts": headlines[:3],
                "summary": f"VADER analysis of {len(headlines)} headlines yields {score:.2f} sentiment.",
            })

        return {
            "sentiments": sentiments,
            "method": "gpt" if use_gpt else "vader",
        }

    def _gpt_analyze(self, client: Any, symbol: str, headlines: List[str]) -> Dict[str, Any]:
        prompt = (
            f"Analyze the sentiment of these {len(headlines)} headlines about {symbol} stock.\n"
            "Return JSON: {\"score\": float (-1 bearish to +1 bullish), \"confidence\": float (0-1), "
            "\"catalysts\": [top 3 key themes], \"summary\": \"1-2 sentence summary\"}\n\n"
            "Headlines:\n" + "\n".join(f"- {h}" for h in headlines[:15])
        )
        response = client.responses.create(
            model=settings.openai_model,
            input=prompt,
            temperature=0.1,
        )
        text = (response.output_text or "").strip()
        # Parse JSON from response
        cleaned = text
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        parsed = json.loads(cleaned)
        return {
            "symbol": symbol,
            "score": max(-1, min(1, float(parsed.get("score", 0)))),
            "confidence": max(0, min(1, float(parsed.get("confidence", 0.5)))),
            "headline_count": len(headlines),
            "catalysts": parsed.get("catalysts", [])[:5],
            "summary": str(parsed.get("summary", "")),
        }
