from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.config import settings
from app.external.yfinance_client import yfinance_client
from app.models import UserProfile
from app.session_store import session_store

from .base_agent import AgentResult
from .sentiment_agent import SentimentAgent
from .fundamental_agent import FundamentalAgent
from .risk_agent import RiskAgent
from .earnings_agent import EarningsAgent
from .macro_agent import MacroAgent
from .screener_agent import ScreenerAgent

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]


class MasterAgent:
    """Orchestrates all agents based on user profile, produces personalized recommendations via SSE."""

    def __init__(self):
        self.sentiment_agent = SentimentAgent()
        self.fundamental_agent = FundamentalAgent()
        self.risk_agent = RiskAgent()
        self.earnings_agent = EarningsAgent()
        self.macro_agent = MacroAgent()

    async def run_streaming(self, profile: UserProfile) -> AsyncGenerator[str, None]:
        yield self._sse("profile_loaded", {
            "goal": profile.investment_goal,
            "risk_tolerance": profile.risk_tolerance,
            "time_horizon": profile.time_horizon,
        })

        # Load holdings
        holdings = session_store.get_all_holdings()
        if len(holdings) < 2:
            yield self._sse("error", {"message": "Need at least 2 holdings for advisor analysis."})
            yield self._sse("done", {})
            return

        symbols = list({h.symbol for h in holdings})
        yield self._sse("status", {"message": f"Analyzing {len(symbols)} holdings..."})

        # Fetch shared data
        try:
            historical_prices = yfinance_client.get_historical_prices(symbols, period_days=365)
        except Exception as exc:
            yield self._sse("error", {"message": f"Failed to fetch historical data: {exc}"})
            yield self._sse("done", {})
            return

        # Market caps and sector info
        market_caps: Dict[str, float] = {}
        stock_sectors: Dict[str, str] = {}
        stock_names: Dict[str, str] = {}
        for s in symbols:
            info = yfinance_client.get_stock_info(s)
            market_caps[s] = float(info.get("marketCap") or 1e9)
            stock_sectors[s] = info.get("sector") or "Other"
            stock_names[s] = info.get("longName") or s

        # Current weights and values
        total_value = sum(h.quantity * (h.current_price or h.buy_price) for h in holdings)
        current_weights: Dict[str, float] = {}
        stock_values: Dict[str, float] = {}
        for h in holdings:
            val = h.quantity * (h.current_price or h.buy_price)
            current_weights[h.symbol] = current_weights.get(h.symbol, 0) + (val / total_value if total_value else 0)
            stock_values[h.symbol] = stock_values.get(h.symbol, 0) + val

        # Compute gaps
        actual_type_alloc = self._compute_type_allocation(symbols, stock_sectors, current_weights)
        gaps = {k: profile.target_allocation.get(k, 0) - actual_type_alloc.get(k, 0) for k in profile.target_allocation}
        sector_gaps = self._compute_sector_gaps(stock_sectors, current_weights, profile.sector_preferences)

        yield self._sse("gaps_identified", {
            "allocation_gaps": {k: round(v, 4) for k, v in gaps.items()},
            "sector_gaps": sector_gaps,
        })

        # Decide which agents to run
        agents_to_run: List[str] = ["fundamental", "risk"]
        if profile.investment_goal != "preservation":
            agents_to_run.extend(["sentiment", "earnings"])
        needs_screener = bool(sector_gaps) or any(abs(v) > 0.05 for v in gaps.values())
        if needs_screener:
            agents_to_run.append("macro")

        for name in agents_to_run:
            yield self._sse("agent_start", {"agent": name})

        # Run Phase 1 agents in parallel
        timeout = settings.agent_timeout
        agent_map = {
            "fundamental": self.fundamental_agent,
            "risk": self.risk_agent,
            "sentiment": self.sentiment_agent,
            "earnings": self.earnings_agent,
            "macro": self.macro_agent,
        }

        tasks = {}
        for name in agents_to_run:
            agent = agent_map[name]
            tasks[name] = asyncio.create_task(
                asyncio.wait_for(
                    agent.run(symbols, historical_prices, market_caps, current_weights),
                    timeout=timeout,
                )
            )

        results: Dict[str, AgentResult] = {}
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

        # Phase 2: Screener if needed
        screener_data: Optional[Dict] = None
        if needs_screener:
            yield self._sse("agent_start", {"agent": "screener"})
            try:
                # Build criteria from profile + macro results
                target_sectors = list(profile.sector_preferences) if profile.sector_preferences else []
                macro_data = results.get("macro")
                if macro_data and macro_data.status == "complete":
                    leading = macro_data.data.get("leading_sectors", [])
                    for s in leading:
                        if s not in target_sectors:
                            target_sectors.append(s)

                screener = ScreenerAgent(criteria={
                    "target_sectors": target_sectors,
                    "max_candidates": 6,
                })
                screener_result = await asyncio.wait_for(
                    screener.run(symbols, historical_prices, market_caps, current_weights),
                    timeout=timeout,
                )
                results["screener"] = screener_result
                screener_data = screener_result.data if screener_result.status == "complete" else None
                yield self._sse("screener_complete", {"data": screener_result.to_dict()})
            except Exception as exc:
                yield self._sse("agent_error", {"agent": "screener", "errors": [str(exc)]})

        # Phase 3: GPT Synthesis
        yield self._sse("advisor_thinking", {"message": "Synthesizing personalized recommendations..."})

        recommendation = await self._synthesize(
            profile=profile,
            symbols=symbols,
            stock_names=stock_names,
            stock_sectors=stock_sectors,
            current_weights=current_weights,
            stock_values=stock_values,
            total_value=total_value,
            results=results,
            screener_data=screener_data,
            gaps=gaps,
        )

        yield self._sse("recommendation", recommendation)
        yield self._sse("done", {})

    async def _synthesize(
        self,
        profile: UserProfile,
        symbols: List[str],
        stock_names: Dict[str, str],
        stock_sectors: Dict[str, str],
        current_weights: Dict[str, float],
        stock_values: Dict[str, float],
        total_value: float,
        results: Dict[str, AgentResult],
        screener_data: Optional[Dict],
        gaps: Dict[str, float],
    ) -> Dict[str, Any]:
        use_gpt = bool(OpenAI and settings.openai_api_key)

        if use_gpt:
            try:
                return await self._gpt_synthesis(
                    profile, symbols, stock_names, stock_sectors,
                    current_weights, stock_values, total_value,
                    results, screener_data, gaps,
                )
            except Exception as exc:
                logger.warning("GPT synthesis failed, falling back to template: %s", exc)

        return self._template_synthesis(
            profile, symbols, stock_names, stock_sectors,
            current_weights, stock_values, total_value,
            results, screener_data, gaps,
        )

    async def _gpt_synthesis(
        self,
        profile: UserProfile,
        symbols: List[str],
        stock_names: Dict[str, str],
        stock_sectors: Dict[str, str],
        current_weights: Dict[str, float],
        stock_values: Dict[str, float],
        total_value: float,
        results: Dict[str, AgentResult],
        screener_data: Optional[Dict],
        gaps: Dict[str, float],
    ) -> Dict[str, Any]:
        prompt = self._build_synthesis_prompt(
            profile, symbols, stock_names, stock_sectors,
            current_weights, stock_values, total_value,
            results, screener_data, gaps,
        )

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_model,
            input=prompt,
            temperature=0.2,
        )
        text = (response.output_text or "").strip()

        try:
            # Try to extract JSON from the response
            json_start = text.find("{")
            json_end = text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                parsed = json.loads(text[json_start:json_end])
                agents_used = [n for n, r in results.items() if r.status == "complete"]
                parsed["agents_used"] = agents_used
                return parsed
        except (json.JSONDecodeError, KeyError):
            pass

        # Fall back to template if GPT didn't return valid JSON
        return self._template_synthesis(
            profile, symbols, stock_names, stock_sectors,
            current_weights, stock_values, total_value,
            results, screener_data, gaps,
        )

    def _build_synthesis_prompt(
        self,
        profile: UserProfile,
        symbols: List[str],
        stock_names: Dict[str, str],
        stock_sectors: Dict[str, str],
        current_weights: Dict[str, float],
        stock_values: Dict[str, float],
        total_value: float,
        results: Dict[str, AgentResult],
        screener_data: Optional[Dict],
        gaps: Dict[str, float],
    ) -> str:
        lines = [
            "You are a portfolio advisor. Analyze the data below and return a JSON object with this exact schema:",
            '{"diagnosis": "2-3 sentence portfolio assessment",',
            ' "actions": [{"action": "HOLD|SELL|REDUCE|BUY", "symbol": "...", "name": "...", "current_weight": 0.0, "target_weight": 0.0, "dollar_amount": 0.0, "reasoning": "...", "confidence": 0.0, "data_sources": ["..."], "priority": 1}],',
            ' "new_stocks": [{"action": "ADD", "symbol": "...", "name": "...", "target_weight": 0.0, "dollar_amount": 0.0, "reasoning": "...", "confidence": 0.0, "data_sources": ["..."], "priority": 1}],',
            ' "risk_warnings": ["..."],',
            ' "briefing": "Full narrative paragraph summarizing everything"}',
            "",
            "USER PROFILE:",
            f"  Goal: {profile.investment_goal}",
            f"  Risk tolerance: {profile.risk_tolerance}/10",
            f"  Time horizon: {profile.time_horizon}",
            f"  Age: {profile.age_range}",
            f"  Target allocation: {json.dumps(profile.target_allocation)}",
            f"  Sector preferences: {profile.sector_preferences or 'none'}",
            f"  Sector exclusions: {profile.sector_exclusions or 'none'}",
            f"  Monthly investment: ${profile.monthly_investment or 'not specified'}",
            "",
            f"PORTFOLIO (Total: ${total_value:,.2f}):",
        ]

        for s in symbols:
            w = current_weights.get(s, 0)
            v = stock_values.get(s, 0)
            lines.append(f"  {s} ({stock_names.get(s, s)}) — {stock_sectors.get(s, '?')} — {w:.1%} — ${v:,.0f}")

        lines.append(f"\nAllocation gaps: {json.dumps({k: round(v, 4) for k, v in gaps.items()})}")

        # Add agent findings
        for name, result in results.items():
            if result.status != "complete":
                continue
            lines.append(f"\n{name.upper()} AGENT:")
            data = result.data
            if name == "fundamental":
                for sig in data.get("signals", [])[:8]:
                    lines.append(f"  {sig['symbol']}: {sig.get('valuation', 'fair')} (score {sig.get('score', 0.5):.2f}) — {sig.get('summary', '')}")
            elif name == "risk":
                lines.append(f"  CVaR 95%: {data.get('cvar_95', 0):.2%}, Max Drawdown: {data.get('max_drawdown', 0):.2%}, HHI: {data.get('hhi', 0):.3f}")
                hedging = data.get("hedging_suggestions", [])
                if hedging:
                    lines.append(f"  Hedging: {'; '.join(hedging[:3])}")
            elif name == "sentiment":
                for sent in data.get("sentiments", [])[:8]:
                    lines.append(f"  {sent['symbol']}: score {sent.get('score', 0):.2f}, {sent.get('summary', '')}")
            elif name == "earnings":
                for earn in data.get("earnings", [])[:8]:
                    lines.append(f"  {earn['symbol']}: {earn.get('summary', 'N/A')}")
            elif name == "macro":
                lines.append(f"  {data.get('macro_summary', '')}")

        if screener_data and screener_data.get("candidates"):
            lines.append("\nSCREENER CANDIDATES:")
            for c in screener_data["candidates"][:6]:
                lines.append(f"  {c['symbol']} ({c.get('name', '')}) — {c.get('sector', '')} — score {c.get('score', 0):.2f} — {', '.join(c.get('reasons', []))}")

        lines.append("\nIMPORTANT: Return ONLY the JSON object. Include dollar_amount for each action. Use the user's goal and risk tolerance to calibrate aggressiveness.")
        return "\n".join(lines)

    def _template_synthesis(
        self,
        profile: UserProfile,
        symbols: List[str],
        stock_names: Dict[str, str],
        stock_sectors: Dict[str, str],
        current_weights: Dict[str, float],
        stock_values: Dict[str, float],
        total_value: float,
        results: Dict[str, AgentResult],
        screener_data: Optional[Dict],
        gaps: Dict[str, float],
    ) -> Dict[str, Any]:
        """Template-based synthesis when GPT is unavailable."""
        actions: List[Dict] = []
        new_stocks: List[Dict] = []
        risk_warnings: List[str] = []
        agents_used = [n for n, r in results.items() if r.status == "complete"]

        # Analyze each holding
        fund_data = results.get("fundamental")
        risk_data = results.get("risk")
        sent_data = results.get("sentiment")
        earnings_data_result = results.get("earnings")

        fund_scores: Dict[str, Dict] = {}
        if fund_data and fund_data.status == "complete":
            for sig in fund_data.data.get("signals", []):
                fund_scores[sig["symbol"]] = sig

        sent_scores: Dict[str, Dict] = {}
        if sent_data and sent_data.status == "complete":
            for s in sent_data.data.get("sentiments", []):
                sent_scores[s["symbol"]] = s

        for symbol in symbols:
            w = current_weights.get(symbol, 0)
            v = stock_values.get(symbol, 0)
            fs = fund_scores.get(symbol, {})
            ss = sent_scores.get(symbol, {})

            score = fs.get("score", 0.5)
            sentiment = ss.get("score", 0)
            valuation = fs.get("valuation", "fair")

            sources = []
            if fs:
                sources.append("fundamentals")
            if ss:
                sources.append("sentiment")

            # Decide action
            if valuation == "overvalued" and sentiment < -0.2:
                action = "REDUCE" if profile.risk_tolerance < 5 else "SELL"
                target_w = max(0, w * 0.5)
                reasoning = f"{valuation.title()} with negative sentiment ({sentiment:+.2f}). Consider reducing exposure."
                confidence = 0.7
            elif valuation == "overvalued":
                action = "REDUCE"
                target_w = max(0, w * 0.7)
                reasoning = f"Appears overvalued (score {score:.2f}). Trim position."
                confidence = 0.6
            elif valuation == "undervalued" and sentiment > 0.1:
                if w < 0.15:
                    action = "BUY"
                    target_w = min(w * 1.3, 0.20)
                    reasoning = f"Undervalued with positive sentiment. Increase position."
                    confidence = 0.7
                else:
                    action = "HOLD"
                    target_w = w
                    reasoning = f"Strong fundamentals, already well-positioned."
                    confidence = 0.8
            else:
                action = "HOLD"
                target_w = w
                reasoning = f"Fair valuation (score {score:.2f}). Maintain current allocation."
                confidence = 0.5

            dollar_delta = (target_w - w) * total_value
            actions.append({
                "action": action,
                "symbol": symbol,
                "name": stock_names.get(symbol, symbol),
                "current_weight": round(w, 4),
                "target_weight": round(target_w, 4),
                "dollar_amount": round(abs(dollar_delta), 2) if dollar_delta != 0 else 0,
                "reasoning": reasoning,
                "confidence": round(confidence, 2),
                "data_sources": sources,
                "priority": 1 if action in ("SELL", "REDUCE") else 2,
            })

        # New stock suggestions from screener
        if screener_data and screener_data.get("candidates"):
            for c in screener_data["candidates"][:4]:
                target_w = 0.03 if profile.risk_tolerance < 5 else 0.05
                new_stocks.append({
                    "action": "ADD",
                    "symbol": c["symbol"],
                    "name": c.get("name", c["symbol"]),
                    "target_weight": target_w,
                    "dollar_amount": round(total_value * target_w, 2),
                    "reasoning": ". ".join(c.get("reasons", ["Potential addition"])),
                    "confidence": min(c.get("score", 0.5), 0.9),
                    "data_sources": ["screener", "fundamentals"],
                    "priority": 1,
                })

        # Risk warnings
        if risk_data and risk_data.status == "complete":
            rd = risk_data.data
            if rd.get("cvar_95", 0) < -0.15:
                risk_warnings.append(f"High portfolio risk: 95% CVaR is {rd['cvar_95']:.1%}. Consider more defensive positions.")
            if rd.get("hhi", 0) > 0.25:
                risk_warnings.append(f"Portfolio concentration is high (HHI: {rd['hhi']:.3f}). Diversification recommended.")
            for cluster in rd.get("correlated_clusters", []):
                if len(cluster) >= 3:
                    risk_warnings.append(f"Highly correlated cluster: {', '.join(cluster)}. Consider reducing overlap.")

        # Diagnosis
        diag_parts = [f"Portfolio of {len(symbols)} stocks, total ${total_value:,.0f}."]
        if any(a["action"] in ("SELL", "REDUCE") for a in actions):
            diag_parts.append("Some positions need trimming based on valuation.")
        if new_stocks:
            diag_parts.append(f"{len(new_stocks)} new candidates identified for diversification.")
        if risk_warnings:
            diag_parts.append(f"{len(risk_warnings)} risk concern(s) flagged.")
        diagnosis = " ".join(diag_parts)

        # Briefing
        briefing_parts = [
            f"Analysis complete for your {profile.investment_goal} portfolio with risk tolerance {profile.risk_tolerance}/10.",
            f"Current portfolio value: ${total_value:,.0f}.",
        ]
        hold_count = sum(1 for a in actions if a["action"] == "HOLD")
        trim_count = sum(1 for a in actions if a["action"] in ("SELL", "REDUCE"))
        if trim_count:
            briefing_parts.append(f"{trim_count} position(s) recommended for trimming.")
        if hold_count:
            briefing_parts.append(f"{hold_count} position(s) to maintain.")
        if new_stocks:
            briefing_parts.append(f"{len(new_stocks)} new stocks identified as potential additions.")
        briefing = " ".join(briefing_parts)

        return {
            "diagnosis": diagnosis,
            "actions": actions,
            "new_stocks": new_stocks,
            "risk_warnings": risk_warnings,
            "briefing": briefing,
            "agents_used": agents_used,
        }

    def _compute_type_allocation(
        self, symbols: List[str], sectors: Dict[str, str], weights: Dict[str, float]
    ) -> Dict[str, float]:
        """Approximate: treat everything as stocks for now."""
        return {"stocks": sum(weights.values()), "etfs": 0, "bonds": 0, "crypto": 0}

    def _compute_sector_gaps(
        self,
        sectors: Dict[str, str],
        weights: Dict[str, float],
        preferred: List[str],
    ) -> List[str]:
        """Return list of preferred sectors not represented in portfolio."""
        current_sectors = {sectors.get(s, "Other") for s in weights if weights[s] > 0.01}
        return [s for s in preferred if s not in current_sectors]

    def _sse(self, event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"
