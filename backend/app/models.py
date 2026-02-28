from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, date
from uuid import uuid4


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
    max_position_weight: float = Field(default=0.25, ge=0.05, le=1.0, description="Max weight per position (clamp + re-normalize)")

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
    avg_turnover: float = 0.0
    total_rebalances: int = 0

class RunMetadata(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    config_hash: str = ""
    random_seed: int = 42
    data_hash: str = ""

class WalkForwardPeriod(BaseModel):
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    return_pct: float

class OOSReport(BaseModel):
    """Out-of-sample performance summary aggregated from walk-forward periods."""
    num_periods: int = 0
    avg_oos_return: float = 0.0
    median_oos_return: float = 0.0
    oos_hit_rate: float = 0.0
    oos_sharpe_approx: float = 0.0
    avg_is_return: float = 0.0
    is_sharpe_approx: float = 0.0
    performance_decay: float = 0.0

class RegimePerformance(BaseModel):
    """Performance metrics within a single market regime."""
    regime: str
    trading_days: int = 0
    total_return: float = 0.0
    annualized_return: float = 0.0
    volatility: float = 0.0
    sharpe: float = 0.0
    max_drawdown: float = 0.0
    avg_daily_return: float = 0.0

class RegimeAnalysis(BaseModel):
    """Strategy performance split by market regime."""
    regimes: List[RegimePerformance] = []
    survives_crashes: bool = False
    crash_recovery_ratio: float = 0.0

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
    run_metadata: Optional[RunMetadata] = None
    walk_forward_periods: List[WalkForwardPeriod] = []
    oos_report: Optional[OOSReport] = None
    regime_analysis: Optional[RegimeAnalysis] = None

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
    max_position_weight: float = Field(default=0.25, ge=0.05, le=1.0)

class BacktestCompareResponse(BaseModel):
    results: List[BacktestResult]
