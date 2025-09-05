from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, date
from decimal import Decimal

class Holding(BaseModel):
    id: str
    symbol: str = Field(..., description="Stock ticker symbol")
    quantity: float = Field(..., gt=0, description="Number of shares")
    buy_price: float = Field(..., gt=0, description="Price per share when purchased")
    buy_date: date = Field(default_factory=date.today, description="Purchase date")
    current_price: Optional[float] = Field(None, description="Current market price")
    
    class Config:
        json_encoders = {
            date: lambda v: v.isoformat(),
        }

class HoldingCreate(BaseModel):
    symbol: str = Field(..., description="Stock ticker symbol")
    quantity: float = Field(..., gt=0, description="Number of shares")
    buy_price: float = Field(..., gt=0, description="Price per share when purchased")
    buy_date: Optional[date] = Field(None, description="Purchase date")

class HoldingUpdate(BaseModel):
    symbol: Optional[str] = None
    quantity: Optional[float] = Field(None, gt=0)
    buy_price: Optional[float] = Field(None, gt=0)
    buy_date: Optional[date] = None

class MarketQuote(BaseModel):
    symbol: str
    price: float
    change: float
    change_percent: float
    volume: Optional[int] = None
    market_cap: Optional[int] = None
    last_updated: datetime

class PortfolioSummary(BaseModel):
    total_value: float
    total_gain_loss: float
    total_gain_loss_percent: float
    holdings_count: int

class PortfolioOverview(BaseModel):
    summary: PortfolioSummary
    holdings: List[Holding]
    sector_allocation: Optional[Dict[str, float]] = None

class HoldingWithMetrics(BaseModel):
    id: str
    symbol: str
    quantity: float
    buy_price: float
    buy_date: date
    current_price: float
    value: float
    gain_loss: float
    gain_loss_percent: float

class CSVUploadResponse(BaseModel):
    success: bool
    message: str
    holdings_added: int
    errors: List[str] = []

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None

# Sentiment Analysis Models
class SentimentData(BaseModel):
    symbol: str
    sentiment_score: float = Field(..., ge=0, le=1, description="Sentiment score from 0 (negative) to 1 (positive)")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in sentiment analysis")
    mentions_count: int = Field(..., ge=0, description="Number of mentions found")
    source: str = Field(..., description="Data source: 'news', 'reddit', 'twitter'")
    timestamp: datetime = Field(default_factory=datetime.now, description="When sentiment was analyzed")

class SourceBreakdown(BaseModel):
    twitter: int = 0
    reddit: int = 0
    news: int = 0

class AggregatedSentiment(BaseModel):
    symbol: str
    overall_sentiment: float = Field(..., ge=0, le=1, description="Aggregated sentiment score")
    total_mentions: int = Field(..., ge=0, description="Total mentions across all sources")
    sources: SourceBreakdown = Field(default_factory=SourceBreakdown, description="Breakdown by source")
    price: Optional[float] = Field(None, description="Current stock price")
    price_change: Optional[float] = Field(None, description="Price change percentage")
    volume: Optional[int] = Field(None, description="Trading volume")
    last_updated: datetime = Field(default_factory=datetime.now, description="Last update timestamp")

class SentimentAlert(BaseModel):
    symbol: str
    sentiment_score: float
    alert_type: str = Field(..., description="'positive_spike', 'negative_spike', 'high_volume'")
    mentions_count: int
    message: str
    timestamp: datetime = Field(default_factory=datetime.now)

class SentimentOverview(BaseModel):
    sentiments: List[AggregatedSentiment]
    alerts: List[SentimentAlert]
    last_updated: datetime = Field(default_factory=datetime.now)

# Portfolio Optimization Models
class OptimizationRequest(BaseModel):
    risk_profile: str = Field(..., description="Risk profile: 'conservative', 'moderate', 'aggressive'")
    objective: str = Field(default="max_sharpe", description="Optimization objective: 'max_sharpe', 'min_volatility', 'efficient_return'")
    target_return: Optional[float] = Field(None, ge=0, le=1, description="Target return for efficient_return objective")
    lookback_period: int = Field(default=252, ge=60, le=1260, description="Days of historical data to use (60-1260)")
    min_weight: float = Field(default=0.01, ge=0, le=0.5, description="Minimum weight per asset")
    max_weight: float = Field(default=0.4, ge=0.1, le=1.0, description="Maximum weight per asset")
    current_prices: Optional[Dict[str, float]] = Field(None, description="Current prices from frontend to avoid API calls")

class EfficientFrontierPoint(BaseModel):
    expected_return: float = Field(..., description="Expected annual return")
    volatility: float = Field(..., description="Expected annual volatility")
    sharpe_ratio: float = Field(..., description="Sharpe ratio")
    weights: Dict[str, float] = Field(..., description="Asset weights for this point")

class OptimizationResult(BaseModel):
    optimal_weights: Dict[str, float] = Field(..., description="Optimized asset weights")
    expected_return: float = Field(..., description="Expected annual return")
    volatility: float = Field(..., description="Expected annual volatility")
    sharpe_ratio: float = Field(..., description="Sharpe ratio")
    max_drawdown: Optional[float] = Field(None, description="Maximum drawdown estimate")
    cvar: Optional[float] = Field(None, description="Conditional Value at Risk (95%)")
    efficient_frontier: List[EfficientFrontierPoint] = Field(default=[], description="Efficient frontier points")
    optimization_method: str = Field(..., description="Method used for optimization")
    risk_profile: str = Field(..., description="Risk profile used")
    current_weights: Dict[str, float] = Field(..., description="Current portfolio weights")
    rebalancing_trades: Dict[str, float] = Field(..., description="Required trades to reach optimal weights")
    data_period: str = Field(..., description="Historical data period used")
    last_updated: datetime = Field(default_factory=datetime.now)

class PortfolioMetrics(BaseModel):
    expected_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: Optional[float] = None
    cvar: Optional[float] = None
    weights: Dict[str, float]

class OptimizationError(BaseModel):
    error_type: str = Field(..., description="Type of optimization error")
    message: str = Field(..., description="Error message")
    suggestions: List[str] = Field(default=[], description="Suggestions to fix the error")
