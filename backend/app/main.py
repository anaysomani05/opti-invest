from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from api import portfolio, market, sentiment, optimization

# Create FastAPI application
app = FastAPI(
    title="QuantIQ Backend API",
    description="Backend API for QuantIQ Portfolio Management Platform",
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
app.include_router(sentiment.router, prefix="/api/sentiment", tags=["sentiment"])
app.include_router(optimization.router)

@app.get("/")
async def root():
    """Root endpoint for health check"""
    return {
        "message": "QuantIQ Backend API",
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
