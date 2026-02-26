from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    # Finnhub API (real-time quotes)
    finnhub_api_key: str = ""
    finnhub_base_url: str = "https://finnhub.io/api/v1"

    # Legacy Marketstack API (kept for compatibility while migrating callers)
    marketstack_api_key: str = ""

    # OpenAI API
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    # Sentiment Analysis APIs
    newsapi_key: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "OptiInvest/1.0"

    # Server settings
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True

    # CORS settings
    frontend_url: str = "http://localhost:8080"

    # API/runtime settings
    api_timeout: int = 30
    cache_timeout: int = 300
    sentiment_cache_timeout: int = 1800
    analysis_cache_minutes: int = 15

    # Analysis and scoring configuration
    benchmark_symbol: str = "SPY"
    sector_gap_medium: float = 0.05
    sector_gap_high: float = 0.10
    correlation_alert_threshold: float = 0.70
    removal_score_threshold: int = 50

    # Candidate scoring weights
    score_weight_correlation: float = 40.0
    score_weight_momentum: float = 30.0
    score_weight_fundamentals: float = 20.0
    score_weight_sector_gap: float = 10.0

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
