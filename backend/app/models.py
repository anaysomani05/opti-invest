from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, date


# ── User Profile ──────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    investment_goal: str = Field(..., description="growth | income | preservation | balanced")
    risk_tolerance: int = Field(..., ge=1, le=10)
    time_horizon: str = Field(..., description="short | medium | long")
    age_range: str = Field(..., description="18-30 | 31-45 | 46-60 | 60+")
    target_allocation: Dict[str, float] = Field(..., description="e.g. {'stocks': 0.7, 'etfs': 0.2, 'bonds': 0.1, 'crypto': 0}")
    sector_preferences: List[str] = Field(default_factory=list)
    sector_exclusions: List[str] = Field(default_factory=list)
    monthly_investment: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.now)


# ── Advisor Output ────────────────────────────────────────────────────────────

class PortfolioAction(BaseModel):
    action: str = Field(..., description="BUY | SELL | HOLD | ADD | REDUCE")
    symbol: str
    name: str = ""
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    dollar_amount: Optional[float] = None
    reasoning: str
    confidence: float = Field(default=0.5, ge=0, le=1)
    data_sources: List[str] = Field(default_factory=list)
    priority: int = 1

class AdvisorRecommendation(BaseModel):
    diagnosis: str
    actions: List[PortfolioAction] = Field(default_factory=list)
    new_stocks: List[PortfolioAction] = Field(default_factory=list)
    risk_warnings: List[str] = Field(default_factory=list)
    briefing: str = ""
    agents_used: List[str] = Field(default_factory=list)


# ── Earnings Agent Output ─────────────────────────────────────────────────────

class EarningsData(BaseModel):
    symbol: str
    next_earnings_date: Optional[str] = None
    days_until_earnings: Optional[int] = None
    last_surprise_pct: Optional[float] = None
    beat_streak: int = 0
    analyst_consensus: str = "hold"
    price_target_upside: Optional[float] = None
    estimate_revisions: str = "flat"
    summary: str = ""


# ── Macro Agent Output ────────────────────────────────────────────────────────

class SectorMomentum(BaseModel):
    sector: str
    etf: str
    return_1m: float
    return_3m: float
    signal: str = Field(default="neutral", description="strong | neutral | weak")

class MacroSnapshot(BaseModel):
    vix: Optional[float] = None
    vix_trend: str = "stable"
    yield_10y: Optional[float] = None
    market_regime: str = "neutral"
    sector_rotation: List[SectorMomentum] = Field(default_factory=list)
    leading_sectors: List[str] = Field(default_factory=list)
    lagging_sectors: List[str] = Field(default_factory=list)
    macro_summary: str = ""

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
