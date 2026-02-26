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


# ── Agent Optimization Models ──────────────────────────────────────────────────

class StockSentiment(BaseModel):
    symbol: str
    score: float = Field(..., ge=-1, le=1, description="Sentiment score -1 (bearish) to +1 (bullish)")
    confidence: float = Field(default=0.5, ge=0, le=1)
    headline_count: int = 0
    catalysts: List[str] = Field(default_factory=list)
    summary: str = ""

class SentimentAgentOutput(BaseModel):
    sentiments: List[StockSentiment] = Field(default_factory=list)
    method: str = "gpt"

class FundamentalSignal(BaseModel):
    symbol: str
    score: float = Field(..., ge=0, le=1, description="Fundamental quality score 0-1")
    valuation: str = Field(default="fair", description="undervalued | fair | overvalued")
    metrics: Dict[str, Any] = Field(default_factory=dict)
    summary: str = ""

class FundamentalAgentOutput(BaseModel):
    signals: List[FundamentalSignal] = Field(default_factory=list)

class StressTest(BaseModel):
    scenario: str
    portfolio_impact: float
    worst_hit: str = ""
    best_performer: str = ""

class RiskAgentOutput(BaseModel):
    cvar_95: float = 0.0
    cvar_99: float = 0.0
    max_drawdown: float = 0.0
    hhi: float = 0.0
    stress_tests: List[StressTest] = Field(default_factory=list)
    correlated_clusters: List[List[str]] = Field(default_factory=list)
    hedging_suggestions: List[str] = Field(default_factory=list)
    per_stock_risk: Dict[str, float] = Field(default_factory=dict)

class BLView(BaseModel):
    symbol: str
    expected_excess_return: float
    confidence: float
    sources: List[str] = Field(default_factory=list)

class BLOptimizationResult(BaseModel):
    optimal_weights: Dict[str, float] = Field(default_factory=dict)
    expected_return: float = 0.0
    volatility: float = 0.0
    sharpe_ratio: float = 0.0
    views: List[BLView] = Field(default_factory=list)
    current_weights: Dict[str, float] = Field(default_factory=dict)
    method: str = "black_litterman"

class AgentOptimizationResponse(BaseModel):
    sentiment: Optional[Dict[str, Any]] = None
    fundamental: Optional[Dict[str, Any]] = None
    risk: Optional[Dict[str, Any]] = None
    bl_result: Optional[Dict[str, Any]] = None
    report: str = ""
    errors: List[str] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    risk_profile: str = Field(default="moderate", description="Risk profile: conservative|moderate|aggressive")
    current_prices: Dict[str, float] = Field(default_factory=dict, description="Current prices from frontend")
    lookback_period: int = Field(default=365, ge=90, le=1260, description="Days of historical data")


class HealthSubScores(BaseModel):
    diversification: float
    correlation: float
    concentration: float
    quality: float


class SectorGap(BaseModel):
    sector: str
    current_weight: float
    benchmark_weight: float
    gap: float
    severity: str


class HighCorrelationPair(BaseModel):
    stock_a: str
    stock_b: str
    correlation: float


class RiskContribution(BaseModel):
    symbol: str
    weight: float
    variance_contribution: float
    marginal_sharpe_impact: float


class RemovalCandidate(BaseModel):
    symbol: str
    removal_score: float
    reasons: List[str] = Field(default_factory=list)
    explanation: str = ""
    metrics: Dict[str, Any] = Field(default_factory=dict)


class AdditionCandidate(BaseModel):
    symbol: str
    name: str
    sector: str
    exchange: str = ""
    reasons: List[str] = Field(default_factory=list)
    explanation: str = ""
    metrics: Dict[str, Any] = Field(default_factory=dict)
    fills_sector_gap: bool = False


class SectorAnalysisSummary(BaseModel):
    current: Dict[str, float] = Field(default_factory=dict)
    benchmark: Dict[str, float] = Field(default_factory=dict)
    gaps: List[SectorGap] = Field(default_factory=list)
    overweight: List[str] = Field(default_factory=list)
    underweight: List[str] = Field(default_factory=list)


class PortfolioAnalysis(BaseModel):
    health_score: int
    health_grade: str
    health_sub_scores: HealthSubScores
    diagnosis: str
    sector_summary: SectorAnalysisSummary
    high_correlation_pairs: List[HighCorrelationPair] = Field(default_factory=list)
    correlation_matrix: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    risk_contributions: List[RiskContribution] = Field(default_factory=list)
    removal_candidates: List[RemovalCandidate] = Field(default_factory=list)
    addition_candidates: List[AdditionCandidate] = Field(default_factory=list)
    optimized_result: Optional[OptimizationResult] = None
    lookback_period: int
    generated_at: datetime = Field(default_factory=datetime.now)


# ── Intelligence Models ────────────────────────────────────────────────────

class SignalFactor(BaseModel):
    source: str
    signal: str
    score: float
    weight: float

class StockSignal(BaseModel):
    symbol: str
    action: str = Field(..., description="BUY | HOLD | SELL")
    confidence: float = Field(..., ge=0, le=1)
    composite_score: float = 0.5
    reasoning: str = ""
    factors: List[SignalFactor] = Field(default_factory=list)

class DiscoverySuggestion(BaseModel):
    symbol: str
    name: str
    sector: str
    score: float
    reason: str
    metrics: Dict[str, Any] = Field(default_factory=dict)

class NewsItem(BaseModel):
    headline: str
    symbol: str
    sentiment_score: float
    sentiment_label: str
    source: str = "news"

class RiskAlert(BaseModel):
    severity: str = Field(..., description="high | medium | low")
    category: str
    message: str
    affected_symbols: List[str] = Field(default_factory=list)
