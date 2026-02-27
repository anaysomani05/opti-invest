from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models import UserProfile
from app.session_store import session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.post("")
async def save_profile(profile: UserProfile):
    """Save or update user profile."""
    session_store.set_user_profile(profile.model_dump(mode="json"))
    return {"status": "ok"}


@router.get("")
async def get_profile():
    """Get current user profile."""
    data = session_store.get_user_profile()
    if data is None:
        raise HTTPException(status_code=404, detail="No profile found")
    return data


@router.get("/exists")
async def profile_exists():
    """Check whether a user profile has been created."""
    return {"exists": session_store.has_user_profile()}
