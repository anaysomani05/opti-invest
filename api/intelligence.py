from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.agents.intel_orchestrator import IntelligenceOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


@router.post("/run")
async def run_intelligence():
    """SSE streaming endpoint for intelligence scan."""
    orchestrator = IntelligenceOrchestrator()

    return StreamingResponse(
        orchestrator.run_streaming(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/run-sync")
async def run_intelligence_sync():
    """Non-streaming synchronous version."""
    orchestrator = IntelligenceOrchestrator()
    return await orchestrator.run_sync()
