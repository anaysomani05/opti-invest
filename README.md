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

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher) and npm
- **Python** (v3.8 or higher) and pip
- **API Keys** (optional but recommended for full functionality):
  - Finnhub API key (free tier available)
  - Marketstack API key (100 free requests/month)
  - NewsAPI key (1000 free requests/day)
  - Reddit API credentials (free tier)

### Installation

1. **Clone the repository**
```bash
git clone <YOUR_GIT_URL>
cd opti-invest
```

2. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

3. **Install Backend Dependencies**
```bash
cd ../backend
pip install -r requirements.txt
```

4. **Configure Environment Variables**
Create a `.env` file in the backend directory:
```env
# Finnhub API (primary data source)
FINNHUB_API_KEY=your_finnhub_api_key

# Marketstack API (for historical data)
MARKETSTACK_API_KEY=your_marketstack_api_key

# Sentiment Analysis APIs
NEWSAPI_KEY=your_newsapi_key
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=OptiInvest/1.0

# Server settings
HOST=127.0.0.1
PORT=8000
DEBUG=true
FRONTEND_URL=http://localhost:8080
```

### Running the Application

1. **Start the Backend Server**
```bash
cd backend
python run.py
```
The API will be available at `http://localhost:8000`

2. **Start the Frontend Development Server**
```bash
cd frontend
npm run dev
```
The application will be available at `http://localhost:8080`

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

## Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy to Vercel or your preferred platform
```

### Backend (Railway/Heroku/DigitalOcean)
```bash
cd backend
# Configure production environment variables
# Deploy using your preferred platform
```



**Opti-Invest** - Optimize your investment strategy with AI-powered portfolio management and sentiment analysis.