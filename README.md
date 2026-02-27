# Opti-Invest

**AI-Powered Portfolio Advisor**

A personal portfolio management platform with an AI advisor that analyzes your holdings using multiple specialized agents (fundamentals, sentiment, earnings, macro, screener) and delivers personalized, data-driven recommendations aligned to your investor profile.

## Core User Journey

1. **Onboarding** — 5-step profile: goal, risk tolerance, time horizon, age, target allocation & sector preferences
2. **Portfolio Overview** — Live holdings, sector allocation, gain/loss metrics
3. **Portfolio Management** — Add, edit, delete holdings or bulk-import via CSV
4. **AI Advisor** — Run analysis → streaming agent results → personalized BUY/SELL/HOLD recommendations with reasoning, confidence scores, and risk warnings

## Technology Stack

### Frontend
- React 18 + TypeScript + Vite 7
- Tailwind CSS + shadcn/ui
- Recharts for data visualization
- React Query for data fetching
- JetBrains Mono terminal-style design system

### Backend
- FastAPI (Python)
- OpenAI GPT for agent reasoning
- yfinance for market data
- Finnhub API for real-time quotes & news
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
OPENAI_API_KEY=your_openai_key
```

## Project Structure

```
frontend/src/
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── Sidebar/               # Navigation sidebar
│   ├── Onboarding/            # 5-step investor profile setup
│   ├── PortfolioOverview/     # Dashboard with live metrics
│   ├── PortfolioManagement/   # Holdings CRUD + CSV import
│   └── Advisor/               # AI advisor streaming UI
├── lib/
│   ├── api.ts                 # API client, types, SSE helpers
│   └── utils.ts               # Tailwind merge utility
└── pages/
    └── Index.tsx              # Layout + routing

backend/
├── app/
│   ├── main.py                # FastAPI app, CORS, router registration
│   ├── config.py              # Environment & settings
│   ├── models.py              # Pydantic models
│   ├── session_store.py       # In-memory holdings + profile store
│   └── services/
│       ├── portfolio_service.py   # Holdings + market data
│       └── agents/
│           ├── master_agent.py    # Orchestrates all agents → recommendation
│           ├── sentiment_agent.py # News sentiment via Finnhub + GPT
│           ├── fundamental_agent.py # Valuation & financial metrics
│           ├── risk_agent.py      # CVaR, drawdown, stress tests
│           ├── earnings_agent.py  # Earnings dates, surprises, consensus
│           ├── macro_agent.py     # VIX, yields, sector rotation
│           └── screener_agent.py  # New stock discovery
├── api/
│   ├── portfolio.py           # /api/portfolio/*
│   ├── market.py              # /api/market/*
│   ├── profile.py             # /api/profile/*
│   └── advisor.py             # /api/advisor/* (SSE streaming)
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

### Profile
- `POST /api/profile` — Save investor profile
- `GET /api/profile` — Get profile
- `GET /api/profile/exists` — Check if profile exists

### Advisor
- `POST /api/advisor/run` — Run AI analysis (SSE stream)

  Streams events: `profile_loaded` → `gaps_identified` → `agent_start/complete` (×5 agents) → `screener_complete` → `advisor_thinking` → `recommendation` → `done`

## AI Advisor Agents

| Agent | What it does |
|-------|-------------|
| **Fundamental** | P/E, PEG, revenue growth, margins, valuation scoring |
| **Sentiment** | Finnhub news headlines → GPT sentiment scoring + catalysts |
| **Earnings** | Next earnings date, beat streak, analyst consensus, estimate revisions |
| **Macro** | VIX, 10Y yield, sector ETF momentum, market regime detection |
| **Screener** | Discovers new stocks matching profile gaps (sector, allocation) |
| **Master** | Synthesizes all agent outputs → GPT generates final recommendation |
