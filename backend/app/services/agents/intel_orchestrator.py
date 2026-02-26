"""
Intelligence Orchestrator — runs the same 3 agents in parallel but feeds
results into SignalGenerator + DiscoveryEngine instead of Black-Litterman.

SSE events emitted:
  agent_start, agent_complete, agent_error, status,
  signals, discovery, news_feed, risk_alerts, briefing, done
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.config import settings
from app.external.yfinance_client import yfinance_client
from app.session_store import session_store

from .base_agent import AgentResult
from .sentiment_agent import SentimentAgent
from .fundamental_agent import FundamentalAgent
from .risk_agent import RiskAgent
from .signal_generator import generate_signals
from .discovery_engine import discover_candidates

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]


class IntelligenceOrchestrator:
    """Runs agents → signals, discovery, news, alerts, briefing."""

    def __init__(self):
        self.sentiment_agent = SentimentAgent()
        self.fundamental_agent = FundamentalAgent()
        self.risk_agent = RiskAgent()

    # ── SSE streaming entry point ──────────────────────────────────────────

    async def run_streaming(self) -> AsyncGenerator[str, None]:
        # Fetch portfolio
        holdings = session_store.get_all_holdings()
        if len(holdings) < 3:
            yield self._sse("error", {"message": "Need at least 3 holdings for intelligence scan."})
            yield self._sse("done", {})
            return

        symbols = list({h.symbol for h in holdings})
        yield self._sse("status", {"message": f"Scanning {len(symbols)} holdings..."})

        # Shared data
        try:
            historical_prices = yfinance_client.get_historical_prices(symbols, period_days=365)
        except Exception as exc:
            yield self._sse("error", {"message": f"Failed to fetch historical data: {exc}"})
            yield self._sse("done", {})
            return

        market_caps: Dict[str, float] = {}
        for s in symbols:
            info = yfinance_client.get_stock_info(s)
            market_caps[s] = float(info.get("marketCap") or 1e9)

        total_value = sum(h.quantity * (h.current_price or h.buy_price) for h in holdings)
        current_weights: Dict[str, float] = {}
        for h in holdings:
            val = h.quantity * (h.current_price or h.buy_price)
            current_weights[h.symbol] = current_weights.get(h.symbol, 0) + (val / total_value if total_value else 0)

        # ── Run 3 agents in parallel ──────────────────────────────────────
        yield self._sse("status", {"message": "Launching analysis agents..."})

        for name in ("sentiment", "fundamental", "risk"):
            yield self._sse("agent_start", {"agent": name})

        timeout = settings.agent_timeout
        results: Dict[str, AgentResult] = {}

        tasks = {
            "sentiment": asyncio.create_task(
                asyncio.wait_for(
                    self.sentiment_agent.run(symbols, historical_prices, market_caps, current_weights),
                    timeout=timeout,
                )
            ),
            "fundamental": asyncio.create_task(
                asyncio.wait_for(
                    self.fundamental_agent.run(symbols, historical_prices, market_caps, current_weights),
                    timeout=timeout,
                )
            ),
            "risk": asyncio.create_task(
                asyncio.wait_for(
                    self.risk_agent.run(symbols, historical_prices, market_caps, current_weights),
                    timeout=timeout,
                )
            ),
        }

        for name, task in tasks.items():
            try:
                result = await task
                results[name] = result
                yield self._sse("agent_complete", {"agent": name, "data": result.to_dict()})
            except asyncio.TimeoutError:
                results[name] = AgentResult(agent_name=name, status="error", errors=[f"Timed out after {timeout}s"])
                yield self._sse("agent_error", {"agent": name, "errors": [f"Timed out after {timeout}s"]})
            except Exception as exc:
                results[name] = AgentResult(agent_name=name, status="error", errors=[str(exc)])
                yield self._sse("agent_error", {"agent": name, "errors": [str(exc)]})

        # Extract data dicts (None if agent errored)
        sentiment_data = results["sentiment"].data if results.get("sentiment") and results["sentiment"].status == "complete" else None
        fundamental_data = results["fundamental"].data if results.get("fundamental") and results["fundamental"].status == "complete" else None
        risk_data = results["risk"].data if results.get("risk") and results["risk"].status == "complete" else None

        # ── Signals ───────────────────────────────────────────────────────
        yield self._sse("status", {"message": "Generating trading signals..."})
        try:
            signals = generate_signals(symbols, sentiment_data, fundamental_data, risk_data)
            yield self._sse("signals", signals)
        except Exception as exc:
            logger.warning("Signal generation failed: %s", exc)
            yield self._sse("signals", [])

        # ── Discovery ─────────────────────────────────────────────────────
        yield self._sse("status", {"message": "Scanning for new opportunities..."})
        try:
            discovery = discover_candidates(
                symbols, current_weights, sentiment_data, fundamental_data, max_candidates=6,
            )
            yield self._sse("discovery", discovery)
        except Exception as exc:
            logger.warning("Discovery engine failed: %s", exc)
            yield self._sse("discovery", [])

        # ── News feed (from sentiment agent headlines) ────────────────────
        news_feed = self._extract_news_feed(sentiment_data)
        yield self._sse("news_feed", news_feed)

        # ── Risk alerts ───────────────────────────────────────────────────
        risk_alerts = self._extract_risk_alerts(risk_data, current_weights)
        yield self._sse("risk_alerts", risk_alerts)

        # ── Briefing ──────────────────────────────────────────────────────
        yield self._sse("status", {"message": "Composing intelligence briefing..."})
        briefing = await self._generate_briefing(symbols, results, signals)
        yield self._sse("briefing", {"text": briefing})

        yield self._sse("done", {})

    # ── Synchronous fallback ──────────────────────────────────────────────

    async def run_sync(self) -> Dict[str, Any]:
        response: Dict[str, Any] = {"errors": []}
        async for event_str in self.run_streaming():
            try:
                lines = event_str.strip().split("\n")
                event_type = ""
                data: Any = {}
                for line in lines:
                    if line.startswith("event: "):
                        event_type = line[7:]
                    elif line.startswith("data: "):
                        data = json.loads(line[6:])

                if event_type == "agent_complete":
                    response[data["agent"]] = data.get("data", {})
                elif event_type == "signals":
                    response["signals"] = data
                elif event_type == "discovery":
                    response["discovery"] = data
                elif event_type == "news_feed":
                    response["news_feed"] = data
                elif event_type == "risk_alerts":
                    response["risk_alerts"] = data
                elif event_type == "briefing":
                    response["briefing"] = data.get("text", "")
                elif event_type == "error":
                    response["errors"].append(data.get("message", ""))
            except Exception:
                pass
        return response

    # ── News extraction ───────────────────────────────────────────────────

    @staticmethod
    def _extract_news_feed(sentiment_data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not sentiment_data:
            return []

        items: List[Dict[str, Any]] = []
        for s in sentiment_data.get("sentiments", []):
            score = s.get("score", 0)
            label = "BULLISH" if score > 0.2 else ("BEARISH" if score < -0.2 else "NEUTRAL")
            for headline in s.get("catalysts", []):
                items.append({
                    "headline": headline,
                    "symbol": s["symbol"],
                    "sentiment_score": round(score, 2),
                    "sentiment_label": label,
                    "source": "news",
                })
        return items[:30]  # cap at 30 items

    # ── Risk alert extraction ─────────────────────────────────────────────

    @staticmethod
    def _extract_risk_alerts(
        risk_data: Optional[Dict[str, Any]],
        current_weights: Dict[str, float],
    ) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        if not risk_data:
            return alerts

        # Concentration alerts
        hhi = risk_data.get("hhi", 0)
        if hhi > 0.25:
            top = sorted(current_weights.items(), key=lambda x: -x[1])[:3]
            syms = [s for s, _ in top]
            alerts.append({
                "severity": "high",
                "category": "concentration",
                "message": f"Portfolio is highly concentrated (HHI {hhi:.2f}). Top holdings: {', '.join(syms)}.",
                "affected_symbols": syms,
            })

        # Stress test alerts
        for st in risk_data.get("stress_tests", []):
            impact = st.get("portfolio_impact", 0)
            if impact < -0.15:
                alerts.append({
                    "severity": "high" if impact < -0.25 else "medium",
                    "category": "stress_test",
                    "message": f"{st['scenario']}: portfolio impact {impact:.1%}. Worst hit: {st.get('worst_hit', 'N/A')}.",
                    "affected_symbols": [st.get("worst_hit", "")] if st.get("worst_hit") else [],
                })

        # Correlation clusters
        for cluster in risk_data.get("correlated_clusters", []):
            if len(cluster) >= 3:
                alerts.append({
                    "severity": "medium",
                    "category": "correlation",
                    "message": f"Highly correlated cluster: {', '.join(cluster)}. Diversification benefit is limited.",
                    "affected_symbols": cluster,
                })

        # Hedging suggestions as low-severity alerts
        for suggestion in risk_data.get("hedging_suggestions", []):
            alerts.append({
                "severity": "low",
                "category": "hedging",
                "message": suggestion,
                "affected_symbols": [],
            })

        return alerts

    # ── Briefing generation ───────────────────────────────────────────────

    async def _generate_briefing(
        self,
        symbols: List[str],
        results: Dict[str, AgentResult],
        signals: List[Dict[str, Any]],
    ) -> str:
        use_gpt = bool(OpenAI and settings.openai_api_key)
        if not use_gpt:
            return self._template_briefing(symbols, results, signals)

        try:
            client = OpenAI(api_key=settings.openai_api_key)
            prompt = self._build_briefing_prompt(symbols, results, signals)
            response = client.responses.create(
                model=settings.openai_model,
                input=prompt,
                temperature=0.3,
            )
            text = (response.output_text or "").strip()
            return text if text else self._template_briefing(symbols, results, signals)
        except Exception as exc:
            logger.warning("GPT briefing generation failed: %s", exc)
            return self._template_briefing(symbols, results, signals)

    def _build_briefing_prompt(
        self, symbols: List[str], results: Dict[str, AgentResult], signals: List[Dict],
    ) -> str:
        parts = [
            "You are a portfolio intelligence analyst. Write a concise morning briefing (3-5 paragraphs).",
            "Focus on actionable insights: what changed, what to watch, what to do.",
            f"Portfolio: {', '.join(symbols)}",
        ]

        buys = [s for s in signals if s["action"] == "BUY"]
        sells = [s for s in signals if s["action"] == "SELL"]
        if buys:
            parts.append(f"BUY signals: {', '.join(s['symbol'] for s in buys)}")
        if sells:
            parts.append(f"SELL signals: {', '.join(s['symbol'] for s in sells)}")

        if results.get("sentiment") and results["sentiment"].status == "complete":
            sents = results["sentiment"].data.get("sentiments", [])
            sent_summary = ", ".join(f"{s['symbol']}: {s['score']:.2f}" for s in sents[:8])
            parts.append(f"Sentiment: {sent_summary}")

        if results.get("risk") and results["risk"].status == "complete":
            rd = results["risk"].data
            parts.append(f"CVaR 95%: {rd.get('cvar_95', 0):.2%}, Max DD: {rd.get('max_drawdown', 0):.2%}")

        parts.append("Write clear, professional analysis with key takeaways.")
        return "\n".join(parts)

    @staticmethod
    def _template_briefing(
        symbols: List[str], results: Dict[str, AgentResult], signals: List[Dict],
    ) -> str:
        lines = ["## Intelligence Briefing\n"]
        lines.append(f"Scanned {len(symbols)} holdings: {', '.join(symbols)}.\n")

        buys = [s for s in signals if s["action"] == "BUY"]
        sells = [s for s in signals if s["action"] == "SELL"]
        holds = [s for s in signals if s["action"] == "HOLD"]

        if buys:
            lines.append(f"**BUY signals**: {', '.join(s['symbol'] for s in buys)} — conditions favour accumulation.")
        if sells:
            lines.append(f"**SELL signals**: {', '.join(s['symbol'] for s in sells)} — consider reducing exposure.")
        if holds:
            lines.append(f"**HOLD**: {', '.join(s['symbol'] for s in holds)} — mixed signals, maintain position.")

        if results.get("sentiment") and results["sentiment"].status == "complete":
            sents = results["sentiment"].data.get("sentiments", [])
            bullish = [s for s in sents if s.get("score", 0) > 0.2]
            bearish = [s for s in sents if s.get("score", 0) < -0.2]
            if bullish:
                lines.append(f"\n**Bullish sentiment**: {', '.join(s['symbol'] for s in bullish)}.")
            if bearish:
                lines.append(f"**Bearish sentiment**: {', '.join(s['symbol'] for s in bearish)}.")

        if results.get("risk") and results["risk"].status == "complete":
            rd = results["risk"].data
            hedging = rd.get("hedging_suggestions", [])
            if hedging:
                lines.append(f"\n**Risk watch**: {' '.join(hedging[:2])}")

        return "\n".join(lines)

    # ── Helper ────────────────────────────────────────────────────────────

    @staticmethod
    def _sse(event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"
