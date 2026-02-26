"""
Signal Generator — converts agent outputs into per-stock BUY / HOLD / SELL signals.

Weighted scoring:
  sentiment   30%
  fundamental 45%
  risk        25%
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Weight each agent's contribution
W_SENTIMENT = 0.30
W_FUNDAMENTAL = 0.45
W_RISK = 0.25


def generate_signals(
    symbols: List[str],
    sentiment_data: Optional[Dict[str, Any]],
    fundamental_data: Optional[Dict[str, Any]],
    risk_data: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Return a list of per-stock signal dicts."""

    # Index agent outputs by symbol for O(1) lookup
    sent_by_sym: Dict[str, Dict] = {}
    if sentiment_data:
        for s in sentiment_data.get("sentiments", []):
            sent_by_sym[s["symbol"]] = s

    fund_by_sym: Dict[str, Dict] = {}
    if fundamental_data:
        for f in fundamental_data.get("signals", []):
            fund_by_sym[f["symbol"]] = f

    per_stock_risk: Dict[str, float] = {}
    if risk_data:
        per_stock_risk = risk_data.get("per_stock_risk", {})

    signals: List[Dict[str, Any]] = []
    for sym in symbols:
        factors: List[Dict[str, Any]] = []
        weighted_score = 0.0
        total_weight = 0.0

        # --- Sentiment factor ---
        sent = sent_by_sym.get(sym)
        if sent is not None:
            raw = float(sent.get("score", 0))  # -1 to +1
            normalised = (raw + 1) / 2  # map to 0-1 for scoring
            weighted_score += normalised * W_SENTIMENT
            total_weight += W_SENTIMENT
            label = "bullish" if raw > 0.2 else ("bearish" if raw < -0.2 else "neutral")
            factors.append({
                "source": "sentiment",
                "signal": label,
                "score": round(raw, 3),
                "weight": W_SENTIMENT,
            })

        # --- Fundamental factor ---
        fund = fund_by_sym.get(sym)
        if fund is not None:
            raw = float(fund.get("score", 0.5))  # 0-1
            weighted_score += raw * W_FUNDAMENTAL
            total_weight += W_FUNDAMENTAL
            valuation = fund.get("valuation", "fair")
            factors.append({
                "source": "fundamental",
                "signal": valuation,
                "score": round(raw, 3),
                "weight": W_FUNDAMENTAL,
            })

        # --- Risk factor ---
        vol = per_stock_risk.get(sym)
        if vol is not None:
            # Lower volatility → higher score (inverse)
            # Typical annualised vol 0.15-0.60; clamp and invert
            clamped = max(0.05, min(0.80, vol))
            risk_score = 1.0 - (clamped - 0.05) / 0.75  # 0=high risk, 1=low risk
            weighted_score += risk_score * W_RISK
            total_weight += W_RISK
            risk_label = "low" if risk_score > 0.6 else ("high" if risk_score < 0.3 else "medium")
            factors.append({
                "source": "risk",
                "signal": risk_label,
                "score": round(risk_score, 3),
                "weight": W_RISK,
            })

        # Composite score (0-1)
        composite = weighted_score / total_weight if total_weight > 0 else 0.5

        # Decision thresholds
        if composite >= 0.62:
            action = "BUY"
        elif composite <= 0.38:
            action = "SELL"
        else:
            action = "HOLD"

        # Confidence: how far from 0.5 centre
        confidence = min(1.0, abs(composite - 0.5) * 2 + 0.3)

        # Reasoning
        reasoning = _build_reasoning(sym, action, factors)

        signals.append({
            "symbol": sym,
            "action": action,
            "confidence": round(confidence, 2),
            "composite_score": round(composite, 3),
            "reasoning": reasoning,
            "factors": factors,
        })

    # Sort by confidence desc
    signals.sort(key=lambda s: s["confidence"], reverse=True)
    return signals


def _build_reasoning(symbol: str, action: str, factors: List[Dict]) -> str:
    parts: List[str] = []
    for f in factors:
        src = f["source"]
        sig = f["signal"]
        if src == "sentiment":
            parts.append(f"sentiment is {sig} ({f['score']:+.2f})")
        elif src == "fundamental":
            parts.append(f"fundamentals indicate {sig} (score {f['score']:.2f})")
        elif src == "risk":
            parts.append(f"risk profile is {sig} (score {f['score']:.2f})")

    if not parts:
        return f"Insufficient data to evaluate {symbol}."

    joined = ", ".join(parts)
    if action == "BUY":
        return f"{symbol}: {joined} — conditions favour accumulation."
    elif action == "SELL":
        return f"{symbol}: {joined} — consider reducing exposure."
    else:
        return f"{symbol}: {joined} — mixed signals suggest holding."
