from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    # Finnhub API (real-time quotes)
    finnhub_api_key: str = ""
    finnhub_base_url: str = "https://finnhub.io/api/v1"

    # Server settings
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True

    # CORS settings
    frontend_url: str = "http://localhost:8080"

    # API/runtime settings
    api_timeout: int = 30
    cache_timeout: int = 300
    analysis_cache_minutes: int = 15

    # Benchmark
    benchmark_symbol: str = "SPY"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
