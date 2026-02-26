#!/usr/bin/env python3
"""
OptiInvest Backend Server
Start the FastAPI server for the OptiInvest portfolio management platform
"""
import os, sys

# Auto-activate venv if not already running from it
_dir = os.path.dirname(os.path.abspath(__file__))
_venv_python = os.path.join(_dir, ".venv", "bin", "python")
if os.path.exists(_venv_python) and not sys.prefix.startswith(_dir):
    os.execv(_venv_python, [_venv_python, os.path.abspath(sys.argv[0])] + sys.argv[1:])

import logging
import uvicorn
from app.config import settings

# ── Logging configuration ───────────────────────────────────────────
LOG_FORMAT = "%(asctime)s  %(levelname)-5s  %(name)s  %(message)s"
DATE_FORMAT = "%H:%M:%S"

logging.basicConfig(format=LOG_FORMAT, datefmt=DATE_FORMAT, level=logging.INFO)

# Quiet noisy third-party loggers
for name in ("httpx", "httpcore", "urllib3", "filelock", "peewee", "yfinance", "praw", "prawcore"):
    logging.getLogger(name).setLevel(logging.ERROR)

logger = logging.getLogger("optiinvest")

if __name__ == "__main__":
    logger.info("─" * 50)
    logger.info("OptiInvest Backend  v1.0.0")
    logger.info("Server     http://%s:%s", settings.host, settings.port)
    logger.info("API Docs   http://%s:%s/docs", settings.host, settings.port)
    logger.info("Finnhub    %s", "OK" if settings.finnhub_api_key else "MISSING")
    logger.info("─" * 50)

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
        access_log=False,  # Disable per-request access logs (too noisy)
    )
