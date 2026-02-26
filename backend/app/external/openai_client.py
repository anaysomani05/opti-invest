from __future__ import annotations

import json
import logging
from typing import Dict, List, Any

from app.config import settings

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore[assignment]


class OpenAIClient:
    def __init__(self):
        self.model = settings.openai_model
        self.api_key = settings.openai_api_key
        self._client = OpenAI(api_key=self.api_key) if (OpenAI and self.api_key) else None

    async def generate_analysis_narrative(
        self,
        health_score: int,
        health_grade: str,
        sector_gaps: List[Dict[str, Any]],
        high_corr_pairs: List[Dict[str, Any]],
        removal_candidates: List[Dict[str, Any]],
        addition_candidates: List[Dict[str, Any]],
        n_holdings: int,
    ) -> Dict[str, str]:
        if not self._client:
            return self._generate_template_narratives(
                health_score,
                health_grade,
                sector_gaps,
                high_corr_pairs,
                removal_candidates,
                addition_candidates,
                n_holdings,
            )

        prompt = self._build_prompt(
            health_score,
            health_grade,
            sector_gaps,
            high_corr_pairs,
            removal_candidates,
            addition_candidates,
            n_holdings,
        )

        try:
            response = self._client.responses.create(
                model=self.model,
                input=prompt,
                temperature=0.2,
            )
            text = (response.output_text or "").strip()
            payload = self._safe_parse_json(text)
            if not payload:
                return self._generate_template_narratives(
                    health_score,
                    health_grade,
                    sector_gaps,
                    high_corr_pairs,
                    removal_candidates,
                    addition_candidates,
                    n_holdings,
                )

            result = {"diagnosis": str(payload.get("diagnosis", ""))}
            result.update({k: str(v) for k, v in payload.items() if isinstance(k, str) and k != "diagnosis"})
            if not result.get("diagnosis"):
                result["diagnosis"] = self._generate_template_narratives(
                    health_score,
                    health_grade,
                    sector_gaps,
                    high_corr_pairs,
                    removal_candidates,
                    addition_candidates,
                    n_holdings,
                )["diagnosis"]
            return result
        except Exception as exc:
            logger.warning("OpenAI narrative generation failed, using template fallback: %s", exc)
            return self._generate_template_narratives(
                health_score,
                health_grade,
                sector_gaps,
                high_corr_pairs,
                removal_candidates,
                addition_candidates,
                n_holdings,
            )

    def _build_prompt(
        self,
        health_score: int,
        health_grade: str,
        sector_gaps: List[Dict[str, Any]],
        high_corr_pairs: List[Dict[str, Any]],
        removal_candidates: List[Dict[str, Any]],
        addition_candidates: List[Dict[str, Any]],
        n_holdings: int,
    ) -> str:
        return (
            "You are a portfolio analyst. Return JSON only.\n"
            "Schema: {diagnosis: string, removal_<SYMBOL>: string, addition_<SYMBOL>: string}.\n"
            "Each explanation should be concise and specific.\n"
            f"Holdings: {n_holdings}\n"
            f"Health score: {health_score} ({health_grade})\n"
            f"Sector gaps: {json.dumps(sector_gaps[:8])}\n"
            f"High correlation pairs: {json.dumps(high_corr_pairs[:8])}\n"
            f"Removal candidates: {json.dumps(removal_candidates[:6])}\n"
            f"Addition candidates: {json.dumps(addition_candidates[:6])}\n"
        )

    def _safe_parse_json(self, text: str) -> Dict[str, Any]:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _generate_template_narratives(
        self,
        health_score: int,
        health_grade: str,
        sector_gaps: List[Dict[str, Any]],
        high_corr_pairs: List[Dict[str, Any]],
        removal_candidates: List[Dict[str, Any]],
        addition_candidates: List[Dict[str, Any]],
        n_holdings: int,
    ) -> Dict[str, str]:
        diagnosis = (
            f"Portfolio health is {health_score}/100 ({health_grade}) across {n_holdings} holdings. "
            f"Detected {len(high_corr_pairs)} elevated correlation pairs and {len(sector_gaps)} sector allocation gaps."
        )

        result: Dict[str, str] = {"diagnosis": diagnosis}

        for c in removal_candidates:
            symbol = c.get("symbol", "")
            if symbol:
                reasons = c.get("reasons", [])
                reason_txt = ", ".join(reasons[:2]) if reasons else "risk concentration"
                result[f"removal_{symbol}"] = f"{symbol} is a removal candidate due to {reason_txt}."

        for c in addition_candidates:
            symbol = c.get("symbol", "")
            if symbol:
                sector = c.get("sector", "target sectors")
                result[f"addition_{symbol}"] = f"{symbol} helps improve exposure in {sector} while diversifying factor risk."

        return result


openai_client = OpenAIClient()
