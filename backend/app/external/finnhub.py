import httpx
import asyncio
from typing import Dict, Optional, List
from app.config import settings
from app.models import MarketQuote
from datetime import datetime, timedelta
import logging
import time

logger = logging.getLogger(__name__)

class FinnhubClient:
    """Client for Finnhub API integration - Real-time stock data"""
    
    def __init__(self):
        self.base_url = settings.finnhub_base_url
        self.api_key = settings.finnhub_api_key
        self.timeout = settings.api_timeout
        
        # Rate limiting: 60 calls per minute = 1 call per second
        self.max_calls_per_minute = 60
        self.calls_made = []  # Track timestamps of API calls
        self.rate_limit_window = 60  # 60 seconds window
    
    async def _enforce_rate_limit(self):
        """Enforce rate limiting to stay within 60 calls per minute"""
        current_time = time.time()
        
        # Remove calls older than 1 minute
        self.calls_made = [call_time for call_time in self.calls_made 
                          if current_time - call_time < self.rate_limit_window]
        
        # If we're at the limit, wait until we can make another call
        if len(self.calls_made) >= self.max_calls_per_minute:
            oldest_call = min(self.calls_made)
            wait_time = self.rate_limit_window - (current_time - oldest_call) + 1
            if wait_time > 0:
                logger.info(f"Rate limit reached. Waiting {wait_time:.1f} seconds...")
                await asyncio.sleep(wait_time)
                # Clean up again after waiting
                current_time = time.time()
                self.calls_made = [call_time for call_time in self.calls_made 
                                  if current_time - call_time < self.rate_limit_window]
        
        # Record this call
        self.calls_made.append(current_time)
        logger.info(f"API calls in last minute: {len(self.calls_made)}/{self.max_calls_per_minute}")
    
    async def get_quote(self, symbol: str) -> Optional[MarketQuote]:
        """Get real-time quote for a symbol"""
        # Enforce rate limiting
        await self._enforce_rate_limit()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    'symbol': symbol.upper(),
                    'token': self.api_key
                }
                
                response = await client.get(f"{self.base_url}/quote", params=params)
                response.raise_for_status()
                data = response.json()
                
                # Handle API response
                if 'c' in data and data['c'] is not None:  # 'c' is current price
                    return MarketQuote(
                        symbol=symbol.upper(),
                        price=float(data['c']),
                        change=float(data.get('d', 0)),  # 'd' is change
                        change_percent=float(data.get('dp', 0)),  # 'dp' is change percent
                        volume=int(data.get('v', 0)) if data.get('v') else None,  # 'v' is volume
                        last_updated=datetime.now()
                    )
                
                # Handle error responses
                elif 'error' in data:
                    logger.error(f"Finnhub Error: {data['error']}")
                    return None
                
                return None
                
        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {str(e)}")
            return None
    
    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Optional[MarketQuote]]:
        """Get quotes for multiple symbols with intelligent rate limiting"""
        quotes = {}
        
        logger.info(f"Fetching quotes for {len(symbols)} symbols with rate limiting...")
        
        for symbol in symbols:
            quote = await self.get_quote(symbol)
            quotes[symbol] = quote
        
        return quotes
    
    async def get_company_profile(self, symbol: str) -> Optional[Dict]:
        """Get company profile information"""
        # Enforce rate limiting
        await self._enforce_rate_limit()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    'symbol': symbol.upper(),
                    'token': self.api_key
                }
                
                response = await client.get(f"{self.base_url}/stock/profile2", params=params)
                response.raise_for_status()
                data = response.json()
                
                if 'name' in data:
                    return data
                
                return None
                
        except Exception as e:
            logger.error(f"Error fetching company profile for {symbol}: {str(e)}")
            return None
    
    async def search_symbols(self, query: str) -> List[Dict]:
        """Search for symbols"""
        # Enforce rate limiting
        await self._enforce_rate_limit()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    'q': query,
                    'token': self.api_key
                }
                
                response = await client.get(f"{self.base_url}/search", params=params)
                response.raise_for_status()
                data = response.json()
                
                if 'result' in data:
                    return data['result']
                
                return []
                
        except Exception as e:
            logger.error(f"Error searching symbols: {str(e)}")
            return []
    
    async def get_market_status(self) -> Dict:
        """Get market status (open/closed)"""
        # Enforce rate limiting
        await self._enforce_rate_limit()
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    'exchange': 'US',
                    'token': self.api_key
                }
                
                response = await client.get(f"{self.base_url}/stock/market-status", params=params)
                response.raise_for_status()
                data = response.json()
                
                return data
                
        except Exception as e:
            logger.error(f"Error fetching market status: {str(e)}")
            return {'isOpen': False}
    
    async def test_connection(self) -> bool:
        """Test if the API connection is working"""
        try:
            quote = await self.get_quote('AAPL')
            return quote is not None
        except Exception as e:
            logger.error(f"Finnhub connection test failed: {str(e)}")
            return False

# Global Finnhub client instance
finnhub_client = FinnhubClient()