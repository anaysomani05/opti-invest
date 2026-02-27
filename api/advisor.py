from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import UserProfile
from app.session_store import session_store
from app.services.agents.master_agent import MasterAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


@router.post("/run")
async def run_advisor():
    """SSE streaming endpoint for the AI portfolio advisor."""
    profile_data = session_store.get_user_profile()
    if profile_data is None:
        raise HTTPException(status_code=400, detail="User profile not found. Complete onboarding first.")

    profile = UserProfile(**profile_data)
    agent = MasterAgent()

    return StreamingResponse(
        agent.run_streaming(profile),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
