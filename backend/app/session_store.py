from typing import Dict, List, Optional
from app.models import Holding, HoldingCreate, HoldingUpdate
import uuid
from datetime import date

class SessionStore:
    """In-memory session storage for portfolio holdings"""
    
    def __init__(self):
        self._holdings: Dict[str, Holding] = {}
        self._market_data_cache: Dict[str, dict] = {}
    
    def get_all_holdings(self) -> List[Holding]:
        """Get all holdings in the session"""
        return list(self._holdings.values())
    
    def get_holding(self, holding_id: str) -> Optional[Holding]:
        """Get a specific holding by ID"""
        return self._holdings.get(holding_id)
    
    def add_holding(self, holding_data: HoldingCreate) -> Holding:
        """Add a new holding to the session"""
        holding_id = str(uuid.uuid4())
        buy_date = holding_data.buy_date or date.today()
        
        holding = Holding(
            id=holding_id,
            symbol=holding_data.symbol.upper(),
            quantity=holding_data.quantity,
            buy_price=holding_data.buy_price,
            buy_date=buy_date
        )
        
        self._holdings[holding_id] = holding
        return holding
    
    def update_holding(self, holding_id: str, update_data: HoldingUpdate) -> Optional[Holding]:
        """Update an existing holding"""
        if holding_id not in self._holdings:
            return None
        
        holding = self._holdings[holding_id]
        update_dict = update_data.model_dump(exclude_unset=True)
        
        for field, value in update_dict.items():
            if hasattr(holding, field):
                setattr(holding, field, value)
        
        return holding
    
    def delete_holding(self, holding_id: str) -> bool:
        """Delete a holding from the session"""
        if holding_id in self._holdings:
            del self._holdings[holding_id]
            return True
        return False
    
    def get_symbols(self) -> List[str]:
        """Get all unique symbols in the portfolio"""
        return list(set(holding.symbol for holding in self._holdings.values()))
    
    def clear_portfolio(self) -> None:
        """Clear all holdings from the session"""
        self._holdings.clear()
    
    def cache_market_data(self, symbol: str, data: dict) -> None:
        """Cache market data for a symbol"""
        self._market_data_cache[symbol] = data
    
    def get_cached_market_data(self, symbol: str) -> Optional[dict]:
        """Get cached market data for a symbol"""
        return self._market_data_cache.get(symbol)
    
    def clear_market_cache(self) -> None:
        """Clear all cached market data"""
        self._market_data_cache.clear()

# Global session store instance
session_store = SessionStore()
