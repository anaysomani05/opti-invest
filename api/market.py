from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Optional
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.models import MarketQuote
from app.external.finnhub import finnhub_client

router = APIRouter(prefix="/api/market", tags=["market"])

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
