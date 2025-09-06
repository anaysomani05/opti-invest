# Opti-Invest

**Advanced Portfolio Optimization & Sentiment Analysis Platform**

Transform your investment strategy with AI-powered portfolio optimization, real-time market sentiment analysis, and comprehensive portfolio management tools. Built with modern web technologies and advanced financial algorithms.

## Features

### **Portfolio Management**
- **Real-time Holdings Tracking**: Monitor your portfolio with live market data
- **CSV Import/Export**: Bulk upload holdings via CSV files
- **Performance Metrics**: Track returns, volatility, and risk-adjusted performance
- **Interactive Dashboard**: Visualize portfolio composition and performance

### **AI-Powered Optimization**
- **Modern Portfolio Theory**: Advanced optimization using PyPortfolioOpt
- **Risk Profiles**: Conservative, Moderate, and Aggressive optimization strategies
- **Efficient Frontier**: Visualize optimal risk-return combinations
- **Rebalancing Recommendations**: Get specific trade suggestions for optimal allocation

### **Sentiment Analysis**
- **Multi-Source Data**: News, Reddit, and social media sentiment analysis
- **Real-time Alerts**: Get notified of significant sentiment changes
- **VADER Sentiment Scoring**: Advanced natural language processing
- **Batch Analysis**: Analyze multiple stocks simultaneously

### **Market Data Integration**
- **Finnhub API**: Real-time stock prices and market data
- **Marketstack**: Historical data for optimization algorithms
- **NewsAPI**: Financial news sentiment analysis
- **Reddit API**: Social sentiment from investment communities

## Technology Stack

### Frontend
- **React 18.3.1** with TypeScript 5.8.3
- **Vite 5.4.19** - Lightning-fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Modern, accessible UI component library
- **Recharts** - Beautiful, responsive charts and data visualization
- **React Query** - Powerful data synchronization for React

### Backend
- **FastAPI 0.104.1** - Modern, fast web framework for building APIs
- **PyPortfolioOpt 1.5.5** - Portfolio optimization and risk management
- **Pandas & NumPy** - Data manipulation and numerical computing
- **VADER Sentiment** - Sentiment analysis from social media text
- **yfinance** - Yahoo Finance market data integration
- **scikit-learn** - Machine learning algorithms for risk modeling

## Project Setup

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python run.py
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
Create `.env` file in backend directory:
```
FINNHUB_API_KEY=your_finnhub_key
MARKETSTACK_API_KEY=your_marketstack_key
NEWSAPI_KEY=your_newsapi_key
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_secret
```

## Project Structure

### Frontend
```
frontend/src/
├── components/           # React components
│   ├── ui/              # Reusable UI components (shadcn/ui)
│   ├── Header/          # Navigation and branding
│   ├── PortfolioManagement/    # Portfolio CRUD operations
│   ├── PortfolioOverview/      # Dashboard and metrics
│   ├── SentimentDashboard/     # Sentiment analysis interface
│   └── OptimisationModule/     # Portfolio optimization tools
├── hooks/               # Custom React hooks
├── lib/                 # Utility libraries and API clients
├── pages/               # Application pages and routing
└── main.tsx            # Application entry point
```

### Backend
```
backend/
├── app/
│   ├── main.py         # FastAPI application and routing
│   ├── config.py       # Configuration and environment settings
│   ├── models.py       # Pydantic data models
│   ├── services/       # Business logic services
│   │   ├── portfolio_service.py
│   │   ├── sentiment_service.py
│   │   └── optimization_service.py
│   └── external/       # External API integrations
│       ├── finnhub.py
│       └── marketstack.py
├── api/                # API route definitions
│   ├── portfolio.py
│   ├── sentiment.py
│   ├── market.py
│   └── optimization.py
└── requirements.txt    # Python dependencies
```

## API Endpoints

### Portfolio Management
- `GET /api/portfolio/holdings` - Get all holdings
- `POST /api/portfolio/holdings` - Create new holding
- `PUT /api/portfolio/holdings/{id}` - Update holding
- `DELETE /api/portfolio/holdings/{id}` - Delete holding
- `POST /api/portfolio/upload-csv` - Bulk upload via CSV

### Optimization
- `POST /api/optimization/optimize` - Run portfolio optimization
- `GET /api/optimization/risk-profiles` - Get available risk profiles
- `GET /api/optimization/validate` - Validate portfolio for optimization

### Sentiment Analysis
- `GET /api/sentiment/overview` - Get sentiment overview for all stocks
- `GET /api/sentiment/{symbol}` - Get sentiment for specific stock
- `GET /api/sentiment/alerts` - Get sentiment alerts

### Market Data
- `GET /api/market/quote/{symbol}` - Get real-time quote
- `GET /api/market/historical/{symbol}` - Get historical data

## Key Features in Detail

### Portfolio Optimization
- **Modern Portfolio Theory**: Implements Markowitz mean-variance optimization
- **Risk Profiles**: Pre-configured optimization strategies for different risk tolerances
- **Efficient Frontier**: Visual representation of optimal risk-return combinations
- **Rebalancing**: Specific trade recommendations to achieve optimal allocation

### Sentiment Analysis
- **Multi-Source Aggregation**: Combines news, social media, and Reddit sentiment
- **Real-time Processing**: Continuous monitoring of sentiment changes
- **Alert System**: Notifications for significant sentiment shifts
- **Historical Tracking**: Sentiment trends over time

### Data Management
- **Session-based Storage**: In-memory storage for development and testing
- **CSV Import/Export**: Easy portfolio data management
- **Real-time Updates**: Live market data integration
- **Caching**: Optimized API usage with intelligent caching

**Opti-Invest** - Optimize your investment strategy with AI-powered portfolio management and sentiment analysis.