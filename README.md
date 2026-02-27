# Opti-Invest

**Portfolio Optimizer & Strategy Backtester**

A portfolio management platform with multi-strategy optimization and backtesting. Manage holdings, run historical backtests across optimization strategies, and compare results with detailed performance analytics.

## Core Features

1. **Portfolio Management** — Add, edit, delete holdings or bulk-import via CSV
2. **Strategy Backtester** — Configure and run backtests with multiple optimization strategies (Mean-Variance, Min Variance, Risk Parity, HRP, Max Sharpe, Equal Weight)
3. **Backtest Results** — Equity curves, drawdown charts, monthly returns heatmap, weight allocation over time, trade log, and strategy comparison
4. **Market Ticker** — Live scrolling market index quotes
5. **News Feed** — Real-time financial news headlines via Finnhub

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
- scipy / numpy for portfolio optimization
- In-memory session store (no database)

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
│   ├── models.py              # Pydantic models
│   ├── session_store.py       # In-memory holdings store
│   └── services/
│       ├── portfolio_service.py    # Holdings + market data
│       ├── backtest_engine.py      # Historical backtest runner
│       ├── backtest_compare.py     # Multi-strategy comparison
│       └── optimization/           # Portfolio optimization strategies
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
- `POST /api/backtest/run` — Run backtest for a single strategy
- `POST /api/backtest/compare` — Compare multiple strategies side-by-side
