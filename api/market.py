from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Optional
import sys
import os
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.models import MarketQuote
from app.external.finnhub import finnhub_client
from app.external.yfinance_client import yfinance_client
import yfinance as yf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market"])

GLOBAL_INDICES = [
    # Americas
    {"symbol": "^GSPC",    "name": "S&P 500"},
    {"symbol": "^DJI",     "name": "DOW"},
    {"symbol": "^IXIC",    "name": "NASDAQ"},
    {"symbol": "^GSPTSE",  "name": "TSX"},
    # Europe
    {"symbol": "^FTSE",    "name": "FTSE 100"},
    {"symbol": "^GDAXI",   "name": "DAX"},
    {"symbol": "^FCHI",    "name": "CAC 40"},
    {"symbol": "^STOXX50E","name": "STOXX 50"},
    # Asia-Pacific
    {"symbol": "^N225",    "name": "NIKKEI"},
    {"symbol": "^HSI",     "name": "HANG SENG"},
    {"symbol": "^BSESN",   "name": "SENSEX"},
    {"symbol": "^AXJO",    "name": "ASX 200"},
]

@router.get("/indices")
async def get_global_indices():
    """Get quotes for major world indices."""
    results = []
    for idx in GLOBAL_INDICES:
        try:
            ticker = yf.Ticker(idx["symbol"])
            hist = ticker.history(period="5d")
            if hist.empty or len(hist) < 1:
                continue
            current = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current
            change = current - prev
            change_pct = (change / prev * 100) if prev != 0 else 0.0
            results.append({
                "symbol": idx["symbol"],
                "name": idx["name"],
                "price": round(current, 2),
                "change": round(change, 2),
                "change_percent": round(change_pct, 2),
            })
        except Exception as exc:
            logger.warning("Failed to fetch index %s: %s", idx["symbol"], exc)
    return results


@router.get("/news")
async def get_market_news():
    """Get live breaking market/geopolitical news from multiple sources."""
    import feedparser
    from datetime import datetime
    from urllib.parse import quote_plus

    articles: list[dict] = []
    seen_titles: set[str] = set()

    # Google News RSS feeds — market, economy, geopolitics
    rss_queries = [
        "stock market today",
        "breaking financial news",
        "geopolitics economy",
        "federal reserve interest rates",
        "world news today",
        "top news today",
        "trade war tariffs",
        "oil prices energy",
    ]
    for q in rss_queries:
        try:
            url = f"https://news.google.com/rss/search?q={quote_plus(q)}&hl=en-US&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
            for entry in feed.entries[:8]:
                title = getattr(entry, "title", "")
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                # Parse published time
                published = getattr(entry, "published_parsed", None)
                ts = datetime(*published[:6]).isoformat() if published else None
                source = getattr(entry, "source", {})
                source_name = source.get("title", "") if isinstance(source, dict) else ""
                articles.append({
                    "title": title,
                    "url": getattr(entry, "link", ""),
                    "source": source_name,
                    "published": ts,
                })
        except Exception as exc:
            logger.warning("RSS feed failed for query '%s': %s", q, exc)

    # yfinance trending news
    try:
        import yfinance as yf
        for symbol in ["^GSPC", "^DJI"]:
            ticker = yf.Ticker(symbol)
            news = ticker.news or []
            for item in news[:5]:
                title = item.get("title") or item.get("content", {}).get("title", "")
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                link = item.get("link") or item.get("content", {}).get("canonicalUrl", {}).get("url", "")
                pub = item.get("providerPublishTime")
                ts = datetime.utcfromtimestamp(pub).isoformat() if pub else None
                source_name = item.get("publisher") or item.get("content", {}).get("provider", {}).get("displayName", "")
                articles.append({
                    "title": title,
                    "url": link,
                    "source": source_name,
                    "published": ts,
                })
    except Exception as exc:
        logger.warning("yfinance news failed: %s", exc)

    # Sort by published time (newest first), unknowns at end
    articles.sort(key=lambda a: a.get("published") or "", reverse=True)
    return articles[:30]


@router.get("/quote/{symbol}", response_model=MarketQuote)
async def get_quote(symbol: str):
    """Get real-time quote for a specific symbol"""
    quote = await finnhub_client.get_quote(symbol.upper())
    if not quote:
        raise HTTPException(status_code=404, detail=f"Quote not found for symbol: {symbol}")
    return quote

@router.post("/quotes", response_model=Dict[str, Optional[MarketQuote]])
async def get_batch_quotes(symbols: List[str]):
    """Get quotes for multiple symbols"""
    if not symbols:
        raise HTTPException(status_code=400, detail="No symbols provided")
    
    if len(symbols) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 symbols allowed per request")
    
    quotes = await finnhub_client.get_batch_quotes([s.upper() for s in symbols])
    return quotes

@router.get("/search")
async def search_symbols(q: str = Query(..., description="Search keywords")):
    """Search for stock symbols"""
    if len(q) < 1:
        raise HTTPException(status_code=400, detail="Search query too short")
    
    results = await finnhub_client.search_symbols(q)
    return {"results": results}

@router.get("/fundamentals/{symbol}")
async def get_company_overview(symbol: str):
    """Get company overview and fundamental data"""
    overview = await finnhub_client.get_company_profile(symbol.upper())
    if not overview:
        raise HTTPException(status_code=404, detail=f"Company overview not found for symbol: {symbol}")
    return overview
