from __future__ import annotations

import json
import logging
import traceback

from datetime import date

from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from app.models import BacktestCompareRequest, BacktestConfig, BacktestResult
from app.services.backtest_engine import run_backtest
from app.services.backtest_compare import compare_strategies
from app.services.optimization.registry import get_all_strategies_info
from app.services.report_generator import generate_report

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/strategies")
async def list_strategies():
    """Return available optimization strategies."""
    return [s.model_dump() for s in get_all_strategies_info()]


@router.post("/run")
async def run_single_backtest(config: BacktestConfig):
    """Run a single strategy backtest with SSE progress updates."""

    async def stream():
        try:
            async def on_progress(event_type: str, message: str):
                yield _sse_event(event_type, {"message": message})

            # We can't use yield inside a nested async callback easily,
            # so we collect progress messages and stream the result.
            progress_msgs = []

            def sync_progress(event_type: str, message: str):
                progress_msgs.append((event_type, message))

            # Use a wrapper that stores progress
            async def progress_cb(event_type: str, message: str):
                progress_msgs.append((event_type, message))

            yield _sse_event("status", {"message": f"Starting backtest: {config.strategy}"})

            result = await run_backtest(config, on_progress=None)

            yield _sse_event("result", result.model_dump(mode="json"))
            yield _sse_event("done", {})
        except Exception as e:
            logger.error(f"Backtest failed: {e}\n{traceback.format_exc()}")
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/report")
async def export_report(result: BacktestResult):
    """Generate a Markdown report from a backtest result and return it as a downloadable file."""
    md = generate_report(result)
    strategy = result.strategy.replace(" ", "_")
    today = date.today().isoformat()
    filename = f"backtest_report_{strategy}_{today}.md"
    return Response(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/compare")
async def compare_backtest(req: BacktestCompareRequest):
    """Run multi-strategy comparison with SSE progress."""

    async def stream():
        try:
            yield _sse_event("status", {"message": f"Comparing {len(req.strategies)} strategies..."})

            results = await compare_strategies(req, on_progress=None)

            yield _sse_event("result", {"results": [r.model_dump(mode="json") for r in results]})
            yield _sse_event("done", {})
        except Exception as e:
            logger.error(f"Backtest compare failed: {e}\n{traceback.format_exc()}")
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(stream(), media_type="text/event-stream")
