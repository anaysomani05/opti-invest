import requests
import pandas as pd
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class MarketstackClient:
    """Client for Marketstack API to fetch historical stock data"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, 'marketstack_api_key', None)
        self.base_url = "https://api.marketstack.com/v1"
        self.session = requests.Session()
        
        if not self.api_key:
            logger.warning("Marketstack API key not configured")
    
    def get_historical_data(self, symbols: List[str], start_date: datetime, end_date: datetime) -> pd.DataFrame:
        """
        Fetch historical data for multiple symbols from Marketstack
        
        Args:
            symbols: List of stock symbols
            start_date: Start date for historical data
            end_date: End date for historical data
            
        Returns:
            DataFrame with historical data (columns: symbols, index: dates)
        """
        if not self.api_key:
            raise ValueError("Marketstack API key not configured")
        
        logger.info(f"Fetching historical data from Marketstack for {len(symbols)} symbols")
        
        all_data = {}
        
        for symbol in symbols:
            try:
                data = self._fetch_symbol_data(symbol, start_date, end_date)
                if data is not None and not data.empty:
                    all_data[symbol] = data
                    logger.info(f"Successfully fetched {len(data)} days of data for {symbol}")
                else:
                    logger.warning(f"No data received for {symbol}")
                    
            except Exception as e:
                logger.error(f"Failed to fetch data for {symbol}: {str(e)}")
                continue
        
        if not all_data:
            raise ValueError("No historical data retrieved from Marketstack")
        
        # Combine all data into a single DataFrame
        combined_data = pd.DataFrame(all_data)
        
        # Sort by date
        combined_data = combined_data.sort_index()
        
        logger.info(f"Successfully combined data for {len(all_data)} symbols, {len(combined_data)} trading days")
        return combined_data
    
    def _fetch_symbol_data(self, symbol: str, start_date: datetime, end_date: datetime) -> Optional[pd.Series]:
        """Fetch historical data for a single symbol"""
        
        # Format dates for API
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        params = {
            'access_key': self.api_key,
            'symbols': symbol,
            'date_from': start_str,
            'date_to': end_str,
            'limit': 1000,  # Marketstack free plan limit
            'sort': 'ASC'
        }
        
        try:
            response = self.session.get(f"{self.base_url}/eod", params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            if 'data' not in data or not data['data']:
                logger.warning(f"No data returned for {symbol}")
                return None
            
            # Convert to pandas Series
            records = []
            for record in data['data']:
                records.append({
                    'date': pd.to_datetime(record['date']),
                    'close': float(record['close'])
                })
            
            df = pd.DataFrame(records)
            df.set_index('date', inplace=True)
            
            # Return close prices as Series
            return df['close']
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed for {symbol}: {str(e)}")
            return None
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"Data parsing failed for {symbol}: {str(e)}")
            return None
    
    def test_connection(self) -> bool:
        """Test if Marketstack API is accessible"""
        if not self.api_key:
            return False
        
        try:
            # Test with a simple request - try different parameter names
            params = {
                'access_key': self.api_key,
                'symbols': 'AAPL',
                'limit': 1
            }
            
            response = self.session.get(f"{self.base_url}/eod", params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            return 'data' in data
            
        except Exception as e:
            logger.error(f"Marketstack connection test failed: {str(e)}")
            return False

# Global client instance
marketstack_client = MarketstackClient()
