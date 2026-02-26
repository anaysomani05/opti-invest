from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class AgentResult:
    agent_name: str
    status: str = "pending"  # pending | running | complete | error
    data: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    duration_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "status": self.status,
            "data": self.data,
            "errors": self.errors,
            "duration_seconds": round(self.duration_seconds, 2),
        }


class BaseAgent(ABC):
    name: str = "base"

    def __init__(self):
        self.logger = logging.getLogger(f"agent.{self.name}")

    async def run(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> AgentResult:
        result = AgentResult(agent_name=self.name, status="running")
        start = time.time()
        try:
            data = await self.analyze(symbols, historical_prices, market_caps, current_weights)
            result.data = data
            result.status = "complete"
        except Exception as exc:
            self.logger.exception("Agent %s failed: %s", self.name, exc)
            result.status = "error"
            result.errors.append(str(exc))
        finally:
            result.duration_seconds = time.time() - start
        return result

    @abstractmethod
    async def analyze(
        self,
        symbols: List[str],
        historical_prices: pd.DataFrame,
        market_caps: Dict[str, float],
        current_weights: Dict[str, float],
    ) -> Dict[str, Any]:
        ...
