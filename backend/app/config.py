from pydantic_settings import BaseSettings
from typing import Optional
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    # Finnhub API (primary data source)
    finnhub_api_key: str = ""
    finnhub_base_url: str = "https://finnhub.io/api/v1"
    
    # Marketstack API (for historical data)
    marketstack_api_key: str = ""  # 100 free requests/month
    
    # Sentiment Analysis APIs (Free Tier)
    newsapi_key: str = ""  # NewsAPI.org free tier: 1000 requests/day
    reddit_client_id: str = ""  # Reddit API free tier
    reddit_client_secret: str = ""
    reddit_user_agent: str = "QuantSenseForge/1.0"
    
    # Server settings
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True
    
    # CORS settings
    frontend_url: str = "http://localhost:8080"
    
    # API settings
    api_timeout: int = 30
    cache_timeout: int = 300  # 5 minutes
    sentiment_cache_timeout: int = 1800  # 30 minutes for sentiment data
    
    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
