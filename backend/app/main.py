import logging
import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# ── Logging ──────────────────────────────────────────────────────────
if not logging.root.handlers:
    logging.basicConfig(
        format="%(asctime)s  %(levelname)-5s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
        level=logging.INFO,
    )
for _name in ("httpx", "httpcore", "urllib3", "filelock", "peewee", "yfinance", "praw", "prawcore"):
    logging.getLogger(_name).setLevel(logging.ERROR)

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from api import portfolio, market, profile, advisor

# Create FastAPI application
app = FastAPI(
    title="OptiInvest Backend API",
    description="Backend API for OptiInvest Portfolio Management Platform",
    version="1.0.0",
    debug=settings.debug
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:8080", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(profile.router)
app.include_router(advisor.router)

@app.get("/")
async def root():
    """Root endpoint for health check"""
    return {
        "message": "OptiInvest Backend API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "api_key_configured": bool(settings.finnhub_api_key)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
