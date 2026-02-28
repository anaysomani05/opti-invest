from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, date


# ── Holdings ─────────────────────────────────────────────────────────────────

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


# ── Strategy / Optimization Models ───────────────────────────────────────────

class StrategyConfig(BaseModel):
    strategy: str = "mean_variance"
    lookback_period: int = Field(default=180, ge=60, le=1825)
    risk_free_rate: float = 0.04
    current_prices: Optional[Dict[str, float]] = None
    min_weight: float = 0.0
    max_weight: float = 0.95
    risk_aversion: float = 1.0
    linkage_method: str = "single"

class StrategyInfo(BaseModel):
    id: str
    name: str
    description: str
    best_for: str
    uses_expected_returns: bool = True
    supports_weight_bounds: bool = True


# ── Backtest Models ──────────────────────────────────────────────────────────

class BacktestConfig(BaseModel):
    symbols: List[str]
    strategy: str = "mean_variance"
    start_date: date
    end_date: date = Field(default_factory=date.today)
    initial_capital: float = 100_000.0
    rebalance_frequency: str = Field(default="quarterly", description="monthly | quarterly | semi_annual | annual | buy_and_hold")
    lookback_days: int = Field(default=180, ge=60, le=730)
    benchmark: str = "SPY"
    transaction_cost_bps: float = 10.0

class EquityCurvePoint(BaseModel):
    date: str
    portfolio_value: float
    benchmark_value: float

class WeightSnapshot(BaseModel):
    date: str
    weights: Dict[str, float]

class BacktestTrade(BaseModel):
    date: str
    symbol: str
    action: str
    shares: float
    amount: float
    cost: float

class MonthlyReturn(BaseModel):
    year: int
    month: int
    ret: float

class BacktestMetrics(BaseModel):
    total_return: float
    cagr: float
    volatility: float
    sharpe: float
    sortino: float
    max_drawdown: float
    max_drawdown_duration_days: int
    calmar_ratio: float
    cvar_95: float
    win_rate_monthly: float
    best_month: float
    worst_month: float
    total_transaction_costs: float

class BacktestResult(BaseModel):
    strategy: str
    strategy_name: str
    config: BacktestConfig
    equity_curve: List[EquityCurvePoint]
    weights_over_time: List[WeightSnapshot]
    trades: List[BacktestTrade]
    metrics: BacktestMetrics
    benchmark_metrics: BacktestMetrics
    monthly_returns: List[MonthlyReturn]

class BacktestCompareRequest(BaseModel):
    symbols: List[str]
    strategies: List[str]
    start_date: date
    end_date: date = Field(default_factory=date.today)
    initial_capital: float = 100_000.0
    rebalance_frequency: str = "quarterly"
    lookback_days: int = Field(default=180, ge=60, le=730)
    benchmark: str = "SPY"
    transaction_cost_bps: float = 10.0

class BacktestCompareResponse(BaseModel):
    results: List[BacktestResult]
