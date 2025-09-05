from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.models import AggregatedSentiment, SentimentOverview, SentimentAlert
from app.services.sentiment_service import sentiment_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/overview", response_model=List[AggregatedSentiment])
async def get_sentiment_overview():
    """Get sentiment overview for all tracked stocks"""
    try:
        sentiments = await sentiment_service.get_overview()
        return sentiments
    except Exception as e:
        logger.error(f"Error getting sentiment overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to get sentiment overview")

@router.get("/alerts", response_model=List[SentimentAlert])
async def get_sentiment_alerts():
    """Get current sentiment alerts"""
    try:
        alerts = await sentiment_service.get_alerts()
        return alerts
    except Exception as e:
        logger.error(f"Error getting sentiment alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to get sentiment alerts")

@router.get("/{symbol}", response_model=AggregatedSentiment)
async def get_stock_sentiment(symbol: str):
    """Get detailed sentiment analysis for a specific stock"""
    try:
        symbol = symbol.upper()
        sentiment = await sentiment_service.get_sentiment(symbol)
        return sentiment
    except Exception as e:
        logger.error(f"Error getting sentiment for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sentiment for {symbol}")

@router.post("/batch", response_model=List[AggregatedSentiment])
async def get_batch_sentiment(symbols: List[str]):
    """Get sentiment analysis for multiple stocks"""
    try:
        if len(symbols) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 symbols allowed per batch request")
        
        symbols = [s.upper() for s in symbols]
        sentiments = await sentiment_service.get_batch_sentiments(symbols)
        return sentiments
    except Exception as e:
        logger.error(f"Error getting batch sentiment: {e}")
        raise HTTPException(status_code=500, detail="Failed to get batch sentiment")

@router.get("/sources/{source}", response_model=List[AggregatedSentiment])
async def get_sentiment_by_source(
    source: str, 
    symbols: Optional[List[str]] = Query(None)
):
    """Get sentiment data filtered by source (news, reddit, twitter)"""
    try:
        if source.lower() not in ['news', 'reddit', 'twitter']:
            raise HTTPException(status_code=400, detail="Invalid source. Must be 'news', 'reddit', or 'twitter'")
        
        # For now, return all sentiment data since we aggregate across sources
        # In a more advanced implementation, we could filter by source
        if symbols:
            symbols = [s.upper() for s in symbols]
            sentiments = await sentiment_service.get_batch_sentiments(symbols)
        else:
            sentiments = await sentiment_service.get_overview()
        
        return sentiments
    except Exception as e:
        logger.error(f"Error getting sentiment by source {source}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sentiment from {source}")

@router.get("/correlation/{symbol}")
async def get_price_sentiment_correlation(symbol: str):
    """Get price vs sentiment correlation data for a stock"""
    try:
        symbol = symbol.upper()
        sentiment = await sentiment_service.get_sentiment(symbol)
        
        # For now, return basic correlation info
        # In a full implementation, this would include historical correlation analysis
        correlation_data = {
            "symbol": symbol,
            "current_sentiment": sentiment.overall_sentiment,
            "current_price": sentiment.price,
            "price_change": sentiment.price_change,
            "mentions": sentiment.total_mentions,
            "correlation_coefficient": None,  # Would be calculated from historical data
            "analysis_period": "24h",
            "last_updated": sentiment.last_updated
        }
        
        return correlation_data
    except Exception as e:
        logger.error(f"Error getting correlation for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get correlation for {symbol}")

@router.post("/refresh")
async def refresh_sentiment_cache():
    """Manually refresh sentiment cache for all tracked stocks"""
    try:
        # Clear cache to force fresh data
        sentiment_service.cache.clear()
        sentiment_service.last_update.clear()
        
        # Get fresh data for all tracked stocks
        sentiments = await sentiment_service.get_overview()
        
        return {
            "message": "Sentiment cache refreshed successfully",
            "stocks_updated": len(sentiments),
            "last_updated": max(s.last_updated for s in sentiments) if sentiments else None
        }
    except Exception as e:
        logger.error(f"Error refreshing sentiment cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh sentiment cache")
