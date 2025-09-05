#!/usr/bin/env python3
"""
QuantIQ Backend Server
Start the FastAPI server for the QuantIQ portfolio management platform
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting QuantIQ Backend Server...")
    print(f"Finnhub API Key: {'Configured' if settings.finnhub_api_key else 'Missing'}")
    print(f"Server: http://{settings.host}:{settings.port}")
    print(f"API Docs: http://{settings.host}:{settings.port}/docs")
    print(f"Debug Mode: {settings.debug}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info" if not settings.debug else "debug"
    )
