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
from .black_litterman import BlackLittermanOptimizer

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]


class OptimizationOrchestrator:
    """Runs agents in parallel, streams results via SSE, generates report."""

    def __init__(self):
        self.sentiment_agent = SentimentAgent()
        self.fundamental_agent = FundamentalAgent()
        self.risk_agent = RiskAgent()
        self.bl_optimizer = BlackLittermanOptimizer()

    async def run_streaming(self, risk_profile: str = "moderate") -> AsyncGenerator[str, None]:
        """SSE event generator."""
        # Fetch portfolio
        holdings = session_store.get_all_holdings()
        if len(holdings) < 3:
            yield self._sse("error", {"message": "Need at least 3 holdings for agent optimization."})
            yield self._sse("done", {"weights": {}})
            return

        symbols = list({h.symbol for h in holdings})
        yield self._sse("status", {"message": f"Preparing data for {len(symbols)} holdings..."})

        # Fetch shared data
        try:
            historical_prices = yfinance_client.get_historical_prices(symbols, period_days=365)
        except Exception as exc:
            yield self._sse("error", {"message": f"Failed to fetch historical data: {exc}"})
            yield self._sse("done", {"weights": {}})
            return

        # Market caps
        market_caps: Dict[str, float] = {}
        for s in symbols:
            info = yfinance_client.get_stock_info(s)
            market_caps[s] = float(info.get("marketCap") or 1e9)

        # Current weights
        total_value = sum(h.quantity * (h.current_price or h.buy_price) for h in holdings)
        current_weights: Dict[str, float] = {}
        for h in holdings:
            val = h.quantity * (h.current_price or h.buy_price)
            current_weights[h.symbol] = current_weights.get(h.symbol, 0) + (val / total_value if total_value else 0)

        # Run agents in parallel
        yield self._sse("status", {"message": "Launching analysis agents..."})

        agent_names = ["sentiment", "fundamental", "risk"]
        for name in agent_names:
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
                results[name] = AgentResult(agent_name=name, status="error", errors=[f"Agent timed out after {timeout}s"])
                yield self._sse("agent_error", {"agent": name, "errors": [f"Timed out after {timeout}s"]})
            except Exception as exc:
                results[name] = AgentResult(agent_name=name, status="error", errors=[str(exc)])
                yield self._sse("agent_error", {"agent": name, "errors": [str(exc)]})

        # Black-Litterman optimization
        yield self._sse("status", {"message": "Running Black-Litterman optimization..."})

        sentiment_data = results.get("sentiment", AgentResult(agent_name="sentiment")).data if results.get("sentiment", AgentResult(agent_name="sentiment")).status == "complete" else None
        fundamental_data = results.get("fundamental", AgentResult(agent_name="fundamental")).data if results.get("fundamental", AgentResult(agent_name="fundamental")).status == "complete" else None
        risk_data = results.get("risk", AgentResult(agent_name="risk")).data if results.get("risk", AgentResult(agent_name="risk")).status == "complete" else None

        bl_result = self.bl_optimizer.optimize(
            symbols=symbols,
            historical_prices=historical_prices,
            market_caps=market_caps,
            current_weights=current_weights,
            sentiment_data=sentiment_data,
            fundamental_data=fundamental_data,
            risk_data=risk_data,
        )
        yield self._sse("bl_complete", bl_result)

        # Generate report
        yield self._sse("status", {"message": "Generating portfolio report..."})
        report = await self._generate_report(symbols, results, bl_result)
        yield self._sse("report", {"text": report})

        # Done
        yield self._sse("done", {"weights": bl_result.get("optimal_weights", {})})

    async def run_sync(self, risk_profile: str = "moderate") -> Dict[str, Any]:
        """Non-streaming version that collects all results."""
        response: Dict[str, Any] = {"errors": []}
        async for event_str in self.run_streaming(risk_profile):
            try:
                # Parse SSE format
                lines = event_str.strip().split("\n")
                event_type = ""
                data = {}
                for line in lines:
                    if line.startswith("event: "):
                        event_type = line[7:]
                    elif line.startswith("data: "):
                        data = json.loads(line[6:])

                if event_type == "agent_complete":
                    agent = data.get("agent", "")
                    response[agent] = data.get("data", {})
                elif event_type == "agent_error":
                    agent = data.get("agent", "")
                    response["errors"].extend(data.get("errors", []))
                elif event_type == "bl_complete":
                    response["bl_result"] = data
                elif event_type == "report":
                    response["report"] = data.get("text", "")
                elif event_type == "error":
                    response["errors"].append(data.get("message", ""))
            except Exception:
                pass

        return response

    async def _generate_report(
        self,
        symbols: List[str],
        results: Dict[str, AgentResult],
        bl_result: Dict[str, Any],
    ) -> str:
        use_gpt = bool(OpenAI and settings.openai_api_key)
        if not use_gpt:
            return self._template_report(symbols, results, bl_result)

        try:
            client = OpenAI(api_key=settings.openai_api_key)
            prompt = self._build_report_prompt(symbols, results, bl_result)
            response = client.responses.create(
                model=settings.openai_model,
                input=prompt,
                temperature=0.3,
            )
            text = (response.output_text or "").strip()
            return text if text else self._template_report(symbols, results, bl_result)
        except Exception as exc:
            logger.warning("GPT report generation failed: %s", exc)
            return self._template_report(symbols, results, bl_result)

    def _build_report_prompt(
        self, symbols: List[str], results: Dict[str, AgentResult], bl_result: Dict[str, Any]
    ) -> str:
        parts = [
            "You are a portfolio analyst. Write a concise portfolio analysis report (3-5 paragraphs).",
            f"Portfolio: {', '.join(symbols)}",
            f"Optimization method: {bl_result.get('method', 'unknown')}",
            f"Expected return: {bl_result.get('expected_return', 0):.1%}",
            f"Volatility: {bl_result.get('volatility', 0):.1%}",
            f"Sharpe ratio: {bl_result.get('sharpe_ratio', 0):.2f}",
        ]

        if results.get("sentiment") and results["sentiment"].status == "complete":
            sents = results["sentiment"].data.get("sentiments", [])
            sent_summary = ", ".join(f"{s['symbol']}: {s['score']:.2f}" for s in sents[:8])
            parts.append(f"Sentiment scores: {sent_summary}")

        if results.get("fundamental") and results["fundamental"].status == "complete":
            sigs = results["fundamental"].data.get("signals", [])
            fund_summary = ", ".join(f"{s['symbol']}: {s['valuation']} ({s['score']:.2f})" for s in sigs[:8])
            parts.append(f"Fundamental signals: {fund_summary}")

        if results.get("risk") and results["risk"].status == "complete":
            rd = results["risk"].data
            parts.append(f"CVaR 95%: {rd.get('cvar_95', 0):.2%}, Max Drawdown: {rd.get('max_drawdown', 0):.2%}")

        weights = bl_result.get("optimal_weights", {})
        w_str = ", ".join(f"{k}: {v:.1%}" for k, v in sorted(weights.items(), key=lambda x: -x[1])[:8])
        parts.append(f"Recommended weights: {w_str}")

        views = bl_result.get("views", [])
        if views:
            v_str = ", ".join(f"{v['symbol']}: {v['expected_excess_return']:+.2%}" for v in views[:8])
            parts.append(f"BL views: {v_str}")

        parts.append("Write a clear, professional analysis. Include key takeaways and actionable recommendations.")
        return "\n".join(parts)

    def _template_report(
        self, symbols: List[str], results: Dict[str, AgentResult], bl_result: Dict[str, Any]
    ) -> str:
        lines = [f"## Portfolio Analysis Report\n"]
        lines.append(f"Analyzed {len(symbols)} holdings: {', '.join(symbols)}.\n")

        method = bl_result.get("method", "unknown")
        ret = bl_result.get("expected_return", 0)
        vol = bl_result.get("volatility", 0)
        sharpe = bl_result.get("sharpe_ratio", 0)
        lines.append(f"**Optimization ({method})**: Expected return {ret:.1%}, volatility {vol:.1%}, Sharpe {sharpe:.2f}.\n")

        if results.get("sentiment") and results["sentiment"].status == "complete":
            sents = results["sentiment"].data.get("sentiments", [])
            bullish = [s for s in sents if s.get("score", 0) > 0.2]
            bearish = [s for s in sents if s.get("score", 0) < -0.2]
            if bullish:
                lines.append(f"**Bullish sentiment**: {', '.join(s['symbol'] for s in bullish)}.")
            if bearish:
                lines.append(f"**Bearish sentiment**: {', '.join(s['symbol'] for s in bearish)}.")

        if results.get("fundamental") and results["fundamental"].status == "complete":
            sigs = results["fundamental"].data.get("signals", [])
            undervalued = [s for s in sigs if s.get("valuation") == "undervalued"]
            overvalued = [s for s in sigs if s.get("valuation") == "overvalued"]
            if undervalued:
                lines.append(f"**Undervalued**: {', '.join(s['symbol'] for s in undervalued)}.")
            if overvalued:
                lines.append(f"**Overvalued**: {', '.join(s['symbol'] for s in overvalued)}.")

        if results.get("risk") and results["risk"].status == "complete":
            rd = results["risk"].data
            hedging = rd.get("hedging_suggestions", [])
            if hedging:
                lines.append(f"\n**Risk Insights**: {' '.join(hedging[:2])}")

        weights = bl_result.get("optimal_weights", {})
        top = sorted(weights.items(), key=lambda x: -x[1])[:5]
        if top:
            w_str = ", ".join(f"{k} ({v:.1%})" for k, v in top)
            lines.append(f"\n**Top allocations**: {w_str}.")

        return "\n".join(lines)

    def _sse(self, event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"
