# Opti-Invest

**Portfolio Optimizer & Strategy Backtester**

A portfolio management platform with multi-strategy optimization and backtesting. Manage holdings, run historical backtests across optimization strategies, and compare results with detailed performance analytics including out-of-sample validation, regime analysis, and downloadable Markdown reports.

## Core Features

1. **Portfolio Management** — Add, edit, delete holdings or bulk-import via CSV
2. **Strategy Backtester** — Configure and run backtests with 5 optimization strategies (Mean-Variance, Min Variance, Risk Parity, Black-Litterman, HRP)
3. **Backtest Results** — Equity curves, drawdown charts, monthly returns heatmap, weight allocation over time, trade log, and strategy comparison
4. **Walk-Forward Validation** — Automatic out-of-sample testing with hit rate, OOS Sharpe, and performance decay metrics
5. **Regime Analysis** — Strategy performance split by bull/bear/high-volatility regimes, crash survival detection, and recovery ratios
6. **Report Export** — Download a consolidated Markdown report with all backtest metrics, tables, and allocation snapshots
7. **Market Ticker** — Live scrolling market index quotes
8. **News Feed** — Real-time financial news headlines via Finnhub

## Technology Stack

### Frontend
- React 18 + TypeScript + Vite 7
- Tailwind CSS + shadcn/ui
- Recharts for data visualization
- React Query for data fetching
- JetBrains Mono terminal-style design system

### Backend
- FastAPI (Python)
- yfinance for historical market data
- Finnhub API for real-time quotes & news
- scipy / numpy / cvxpy / pypfopt for portfolio optimization
- In-memory session store (no database)

## Optimization Strategies

| Strategy | Description |
|---|---|
| **Mean-Variance** | Maximizes Sharpe ratio on the efficient frontier |
| **Minimum Variance** | Minimizes portfolio volatility regardless of returns |
| **Risk Parity** | Equalizes risk contribution across all assets |
| **Black-Litterman** | Combines market equilibrium with CAPM-implied views |
| **HRP** | Hierarchical Risk Parity — tree-based clustering, no covariance inversion |

## Setup

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

### Environment Variables
Create `.env` in the backend directory:
```
FINNHUB_API_KEY=your_finnhub_key
```

## Project Structure

```
frontend/src/
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── Sidebar/               # Navigation sidebar
│   ├── PortfolioManagement/   # Holdings CRUD + CSV import
│   ├── Backtest/              # Backtest configuration UI
│   ├── Results/               # Backtest result visualizations
│   │   ├── EquityCurve.tsx
│   │   ├── DrawdownChart.tsx
│   │   ├── MonthlyReturns.tsx
│   │   ├── WeightChart.tsx
│   │   ├── TradeLog.tsx
│   │   └── StrategyComparison.tsx
│   ├── MarketTicker/          # Live index ticker bar
│   └── NewsFeed/              # Real-time news feed
├── lib/
│   ├── api.ts                 # API client, types, fetch wrappers
│   └── utils.ts               # Tailwind merge utility
└── pages/
    └── Index.tsx              # Layout + routing

backend/
├── app/
│   ├── main.py                # FastAPI app, CORS, router registration
│   ├── config.py              # Environment & settings
│   ├── models.py              # Pydantic models (backtest, regime, OOS, walk-forward)
│   ├── session_store.py       # In-memory holdings store
│   └── services/
│       ├── portfolio_service.py    # Holdings + market data
│       ├── backtest_engine.py      # Historical backtest runner + walk-forward + regime analysis
│       ├── backtest_compare.py     # Multi-strategy comparison
│       ├── report_generator.py     # Markdown report builder
│       └── optimization/           # Portfolio optimization strategies
│           ├── mean_variance.py
│           ├── min_variance.py
│           ├── risk_parity.py
│           ├── black_litterman.py
│           ├── hrp.py
│           ├── base.py
│           └── registry.py
├── api/
│   ├── portfolio.py           # /api/portfolio/*
│   ├── market.py              # /api/market/*
│   └── backtest.py            # /api/backtest/*
└── requirements.txt
```

## API Endpoints

### Portfolio
- `GET /api/portfolio/holdings` — List all holdings
- `GET /api/portfolio/holdings-with-metrics` — Holdings with live gain/loss
- `GET /api/portfolio/overview` — Summary + sector allocation
- `POST /api/portfolio/holdings` — Add holding
- `PUT /api/portfolio/holdings/{id}` — Update holding
- `DELETE /api/portfolio/holdings/{id}` — Delete holding
- `POST /api/portfolio/upload-csv` — Bulk import
- `POST /api/portfolio/reset` — Clear all holdings

### Market
- `GET /api/market/quote/{symbol}` — Real-time quote
- `POST /api/market/quotes` — Batch quotes
- `GET /api/market/search?q=` — Symbol search
- `GET /api/market/fundamentals/{symbol}` — Company fundamentals

### Backtest
- `GET /api/backtest/strategies` — List available optimization strategies
- `POST /api/backtest/run` — Run backtest (SSE stream with progress + result)
- `POST /api/backtest/compare` — Compare multiple strategies side-by-side
- `POST /api/backtest/report` — Generate and download a Markdown report from a backtest result

## Backtest Engine Details

The backtest engine runs a walk-forward simulation with the following pipeline:

1. **Data fetch** — Downloads adjusted close prices via yfinance for all symbols + benchmark
2. **Walk-forward loop** — At each rebalance date, fits the chosen optimizer on the lookback window and allocates forward
3. **Transaction costs** — Applies configurable cost (in bps) on absolute weight changes at each rebalance
4. **Weight clamping** — Enforces max position weight and re-normalizes
5. **Metrics** — Computes CAGR, Sharpe, Sortino, Max Drawdown, Calmar, CVaR-95, win rate, turnover, and more for both portfolio and benchmark
6. **Out-of-sample report** — Aggregates walk-forward period returns into hit rate, OOS Sharpe, IS Sharpe, and performance decay
7. **Regime analysis** — Classifies benchmark returns into bull/bear/high-vol regimes and measures strategy performance in each
8. **Report export** — Generates a downloadable Markdown file with all metrics, tables, and allocation snapshots
