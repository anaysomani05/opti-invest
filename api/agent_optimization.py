from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.services.agents.orchestrator import OptimizationOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent-optimization", tags=["agent-optimization"])


@router.post("/run")
async def run_agent_optimization(risk_profile: str = Query(default="moderate")):
    """SSE streaming endpoint for multi-agent portfolio optimization."""
    orchestrator = OptimizationOrchestrator()

    return StreamingResponse(
        orchestrator.run_streaming(risk_profile=risk_profile),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/run-sync")
async def run_agent_optimization_sync(risk_profile: str = Query(default="moderate")):
    """Non-streaming synchronous version."""
    orchestrator = OptimizationOrchestrator()
    return await orchestrator.run_sync(risk_profile=risk_profile)
