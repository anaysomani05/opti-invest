from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging

import numpy as np
import pandas as pd

from app.config import settings
from app.models import (
    AdditionCandidate,
    AnalyzeRequest,
    HealthSubScores,
    HighCorrelationPair,
    HoldingWithMetrics,
    OptimizationRequest,
    PortfolioAnalysis,
    RemovalCandidate,
    RiskContribution,
    SectorAnalysisSummary,
    SectorGap,
)
from app.external.openai_client import openai_client
from app.external.yfinance_client import yfinance_client
from app.services.optimization_service import optimization_service
from app.services.stock_screener import stock_screener

logger = logging.getLogger(__name__)


@dataclass
class AnalysisCacheEntry:
    result: PortfolioAnalysis
    expires_at: datetime


class PortfolioAnalyzer:
    def __init__(self):
        self._cache: Dict[str, AnalysisCacheEntry] = {}
        self._ttl = timedelta(minutes=settings.analysis_cache_minutes)

    async def run_full_analysis(
        self,
        holdings: List[HoldingWithMetrics],
        request: AnalyzeRequest,
    ) -> PortfolioAnalysis:
        if len(holdings) < 2:
            raise ValueError("Need at least 2 holdings")

        symbols = [h.symbol for h in holdings]
        total_value = sum(h.value for h in holdings)
        if total_value <= 0:
            raise ValueError("Portfolio has no value")

        current_weights = {h.symbol: h.value / total_value for h in holdings}

        cache_key = self._build_cache_key(holdings, request)
        cached = self._cache.get(cache_key)
        if cached and cached.expires_at > datetime.now():
            return cached.result

        prices_df = yfinance_client.get_historical_prices(symbols, request.lookback_period)
        if prices_df.empty:
            raise ValueError("No historical data available")

        score, grade, sub_scores = self._compute_health_score(holdings, current_weights, prices_df)
        sector_summary, sector_gaps = self._compute_sector_analysis(holdings, current_weights)
        corr_matrix, high_pairs = self._compute_correlation_matrix(prices_df)
        risk_contribs = self._compute_risk_contributions(holdings, current_weights, prices_df)
        removal_candidates = self._compute_removal_candidates(holdings, current_weights, corr_matrix, risk_contribs, prices_df)

        addition_candidates = self._compute_addition_candidates(
            holdings=holdings,
            prices_df=prices_df,
            sector_gaps=sector_gaps,
        )

        optimized_result = None
        try:
            optimized_result = await optimization_service.optimize_portfolio(
                OptimizationRequest(
                    risk_profile=request.risk_profile,
                    objective="max_sharpe",
                    lookback_period=min(1260, request.lookback_period),
                    current_prices=request.current_prices,
                )
            )
        except Exception as exc:
            logger.warning("Optimization sub-step failed in analysis: %s", exc)

        narratives = await openai_client.generate_analysis_narrative(
            health_score=score,
            health_grade=grade,
            sector_gaps=[g.model_dump() for g in sector_gaps],
            high_corr_pairs=[p.model_dump() for p in high_pairs],
            removal_candidates=[c.model_dump() for c in removal_candidates],
            addition_candidates=[c.model_dump() for c in addition_candidates],
            n_holdings=len(holdings),
        )

        for i, c in enumerate(removal_candidates):
            key = f"removal_{c.symbol}"
            removal_candidates[i] = c.model_copy(update={"explanation": narratives.get(key, c.explanation)})

        for i, c in enumerate(addition_candidates):
            key = f"addition_{c.symbol}"
            addition_candidates[i] = c.model_copy(update={"explanation": narratives.get(key, c.explanation)})

        result = PortfolioAnalysis(
            health_score=score,
            health_grade=grade,
            health_sub_scores=HealthSubScores(**sub_scores),
            diagnosis=narratives.get("diagnosis", "Portfolio analysis completed."),
            sector_summary=sector_summary,
            high_correlation_pairs=high_pairs,
            correlation_matrix=corr_matrix,
            risk_contributions=risk_contribs,
            removal_candidates=removal_candidates,
            addition_candidates=addition_candidates,
            optimized_result=optimized_result,
            lookback_period=request.lookback_period,
        )

        self._cache[cache_key] = AnalysisCacheEntry(result=result, expires_at=datetime.now() + self._ttl)
        return result

    def _build_cache_key(self, holdings: List[HoldingWithMetrics], request: AnalyzeRequest) -> str:
        hkey = "|".join(
            sorted(
                f"{h.symbol}:{h.quantity:.8f}:{h.current_price:.8f}:{h.buy_price:.8f}"
                for h in holdings
            )
        )
        return f"{request.risk_profile}:{request.lookback_period}:{hkey}"

    def _compute_health_score(
        self,
        holdings: List[HoldingWithMetrics],
        weights: Dict[str, float],
        prices_df: pd.DataFrame,
    ) -> Tuple[int, str, Dict[str, float]]:
        sectors = stock_screener.batch_get_sector([h.symbol for h in holdings])
        sector_weights: Dict[str, float] = {}
        for symbol, weight in weights.items():
            sector = sectors.get(symbol, "Other")
            sector_weights[sector] = sector_weights.get(sector, 0.0) + weight

        # Diversification: normalized inverse HHI.
        hhi = sum(w * w for w in sector_weights.values())
        n = max(1, len(sector_weights))
        div_score = max(0.0, min(100.0, (1.0 - hhi) / max(1e-9, (1.0 - 1.0 / n)) * 100.0)) if n > 1 else 0.0

        returns = prices_df.pct_change().dropna()
        corr = returns.corr().abs() if not returns.empty else pd.DataFrame()
        if corr.empty:
            corr_score = 50.0
        else:
            mask = np.triu(np.ones(corr.shape), k=1).astype(bool)
            vals = corr.where(mask).stack().values
            avg_abs = float(np.mean(vals)) if len(vals) else 0.5
            corr_score = max(0.0, 100.0 * (1.0 - min(1.0, avg_abs)))

        max_weight = max(weights.values()) if weights else 1.0
        gini = self._gini(np.array(list(weights.values())))
        concentration_penalty = min(1.0, (max_weight * 0.7) + (gini * 0.3))
        concentration_score = max(0.0, 100.0 * (1.0 - concentration_penalty))

        quality_score = self._weighted_sharpe_score(prices_df, weights)

        sub_scores = {
            "diversification": round(div_score, 1),
            "correlation": round(corr_score, 1),
            "concentration": round(concentration_score, 1),
            "quality": round(quality_score, 1),
        }

        total = int(round(
            (sub_scores["diversification"] * 0.30)
            + (sub_scores["correlation"] * 0.25)
            + (sub_scores["concentration"] * 0.25)
            + (sub_scores["quality"] * 0.20)
        ))

        if total >= 90:
            grade = "A"
        elif total >= 80:
            grade = "B+"
        elif total >= 70:
            grade = "B"
        elif total >= 60:
            grade = "C+"
        elif total >= 50:
            grade = "C"
        elif total >= 40:
            grade = "D"
        else:
            grade = "F"

        return total, grade, sub_scores

    def _compute_sector_analysis(
        self,
        holdings: List[HoldingWithMetrics],
        weights: Dict[str, float],
    ) -> Tuple[SectorAnalysisSummary, List[SectorGap]]:
        symbols = [h.symbol for h in holdings]
        sectors = stock_screener.batch_get_sector(symbols)

        current: Dict[str, float] = {}
        for symbol, weight in weights.items():
            sector = sectors.get(symbol, "Other")
            current[sector] = current.get(sector, 0.0) + weight

        benchmark = yfinance_client.get_benchmark_sector_weights(settings.benchmark_symbol)
        if not benchmark:
            # If benchmark sector weights are unavailable, use normalized current sectors.
            total = sum(current.values())
            benchmark = {k: (v / total if total > 0 else 0.0) for k, v in current.items()}

        all_sectors = sorted(set(current.keys()) | set(benchmark.keys()))
        gaps: List[SectorGap] = []
        overweight: List[str] = []
        underweight: List[str] = []

        for sector in all_sectors:
            cur = float(current.get(sector, 0.0))
            bench = float(benchmark.get(sector, 0.0))
            gap = bench - cur
            if abs(gap) >= settings.sector_gap_high:
                severity = "high"
            elif abs(gap) >= settings.sector_gap_medium:
                severity = "medium"
            else:
                severity = "low"

            if gap > 0:
                underweight.append(sector)
            elif gap < 0:
                overweight.append(sector)

            gaps.append(
                SectorGap(
                    sector=sector,
                    current_weight=cur,
                    benchmark_weight=bench,
                    gap=gap,
                    severity=severity,
                )
            )

        gaps.sort(key=lambda g: abs(g.gap), reverse=True)
        summary = SectorAnalysisSummary(
            current=current,
            benchmark=benchmark,
            gaps=gaps,
            overweight=overweight,
            underweight=underweight,
        )
        return summary, gaps

    def _compute_correlation_matrix(self, prices_df: pd.DataFrame) -> Tuple[Dict[str, Dict[str, float]], List[HighCorrelationPair]]:
        if prices_df.empty:
            return {}, []

        returns = prices_df.pct_change().dropna()
        if returns.empty:
            return {}, []

        corr = returns.corr().fillna(0.0)
        corr_dict = {row: {col: float(corr.loc[row, col]) for col in corr.columns} for row in corr.index}

        pairs: List[HighCorrelationPair] = []
        symbols = list(corr.columns)
        for i, a in enumerate(symbols):
            for b in symbols[i + 1 :]:
                v = float(corr.loc[a, b])
                if abs(v) >= settings.correlation_alert_threshold:
                    pairs.append(HighCorrelationPair(stock_a=a, stock_b=b, correlation=v))

        pairs.sort(key=lambda p: abs(p.correlation), reverse=True)
        return corr_dict, pairs

    def _compute_risk_contributions(
        self,
        holdings: List[HoldingWithMetrics],
        weights: Dict[str, float],
        prices_df: pd.DataFrame,
    ) -> List[RiskContribution]:
        try:
            returns = prices_df.pct_change().dropna()
            if returns.empty:
                return []

            cols = list(returns.columns)
            cov = returns.cov().values
            w = np.array([weights.get(c, 0.0) for c in cols])
            pvar = float(w.T @ cov @ w)
            if pvar <= 0:
                return []

            base_sharpe = self._portfolio_sharpe(returns, w)
            results: List[RiskContribution] = []

            sigma_w = cov @ w
            for idx, symbol in enumerate(cols):
                mcvar = (w[idx] * sigma_w[idx]) / pvar

                # Marginal Sharpe impact if symbol is removed and portfolio renormalized.
                w_removed = w.copy()
                w_removed[idx] = 0.0
                total = w_removed.sum()
                if total > 0:
                    w_removed = w_removed / total
                    sharpe_without = self._portfolio_sharpe(returns, w_removed)
                    marginal = sharpe_without - base_sharpe
                else:
                    marginal = 0.0

                results.append(
                    RiskContribution(
                        symbol=symbol,
                        weight=float(weights.get(symbol, 0.0)),
                        variance_contribution=float(mcvar),
                        marginal_sharpe_impact=float(marginal),
                    )
                )

            results.sort(key=lambda r: r.variance_contribution, reverse=True)
            return results
        except Exception as exc:
            logger.warning("Risk contribution calculation failed: %s", exc)
            return []

    def _compute_removal_candidates(
        self,
        holdings: List[HoldingWithMetrics],
        weights: Dict[str, float],
        corr_matrix: Dict[str, Dict[str, float]],
        risk_contribs: List[RiskContribution],
        prices_df: pd.DataFrame,
    ) -> List[RemovalCandidate]:
        risk_map = {r.symbol: r for r in risk_contribs}
        yearly_returns = self._yearly_returns(prices_df)

        out: List[RemovalCandidate] = []
        for h in holdings:
            score = 0.0
            reasons: List[str] = []

            # Correlation pressure.
            correlations = corr_matrix.get(h.symbol, {})
            high_corr = [abs(v) for k, v in correlations.items() if k != h.symbol and abs(v) >= settings.correlation_alert_threshold]
            if high_corr:
                score += 40.0
                reasons.append("High correlation overlap")

            rc = risk_map.get(h.symbol)
            if rc and rc.marginal_sharpe_impact > 0:
                score += 30.0
                reasons.append("Sharpe improves if removed")

            if weights.get(h.symbol, 0.0) > 0.30:
                score += 20.0
                reasons.append("Concentration risk")

            yr = yearly_returns.get(h.symbol)
            if yr is not None and yr < 0.02:
                score += 10.0
                reasons.append("Weak trailing return")

            if score >= settings.removal_score_threshold:
                out.append(
                    RemovalCandidate(
                        symbol=h.symbol,
                        removal_score=score,
                        reasons=reasons,
                        explanation="",
                        metrics={
                            "weight": weights.get(h.symbol, 0.0),
                            "one_year_return": yr,
                            "high_corr_count": len(high_corr),
                        },
                    )
                )

        out.sort(key=lambda x: x.removal_score, reverse=True)
        return out[:5]

    def _compute_addition_candidates(
        self,
        holdings: List[HoldingWithMetrics],
        prices_df: pd.DataFrame,
        sector_gaps: List[SectorGap],
    ) -> List[AdditionCandidate]:
        existing = [h.symbol for h in holdings]
        candidates: List[AdditionCandidate] = []

        underweights = [g for g in sector_gaps if g.gap > settings.sector_gap_medium]
        for gap in underweights:
            try:
                raw = stock_screener.get_candidates_for_sector(
                    sector=gap.sector,
                    existing_symbols=existing,
                    existing_prices_df=prices_df,
                    max_candidates=3,
                )
                for item in raw:
                    reasons = [
                        "Sector underweight gap",
                        "Diversification fit",
                        "Momentum and fundamentals alignment",
                    ]
                    candidates.append(
                        AdditionCandidate(
                            symbol=item["symbol"],
                            name=item.get("name") or item["symbol"],
                            sector=item.get("sector") or gap.sector,
                            exchange=item.get("exchange") or "",
                            reasons=reasons,
                            explanation="",
                            metrics=item.get("metrics", {}),
                            fills_sector_gap=True,
                        )
                    )
            except Exception as exc:
                logger.warning("Screener failed for sector %s: %s", gap.sector, exc)

        # Deduplicate by symbol and keep top score approximation via correlation_fit + momentum.
        dedup: Dict[str, AdditionCandidate] = {}
        for c in candidates:
            if c.symbol not in dedup:
                dedup[c.symbol] = c

        ranked = sorted(
            dedup.values(),
            key=lambda c: float(c.metrics.get("correlation_fit", 0)) + float(c.metrics.get("momentum_6m", 0)),
            reverse=True,
        )
        return ranked[:5]

    def _yearly_returns(self, prices_df: pd.DataFrame) -> Dict[str, float]:
        out: Dict[str, float] = {}
        if prices_df.empty:
            return out
        for col in prices_df.columns:
            s = prices_df[col].dropna()
            if len(s) >= 2 and float(s.iloc[0]) > 0:
                out[col] = (float(s.iloc[-1]) / float(s.iloc[0])) - 1.0
        return out

    def _gini(self, x: np.ndarray) -> float:
        x = np.asarray(x, dtype=float)
        if np.amin(x) < 0:
            x = x - np.amin(x)
        if np.sum(x) == 0:
            return 0.0
        x = np.sort(x)
        n = x.shape[0]
        idx = np.arange(1, n + 1)
        return float((np.sum((2 * idx - n - 1) * x)) / (n * np.sum(x)))

    def _portfolio_sharpe(self, returns: pd.DataFrame, weights: np.ndarray) -> float:
        mu = float(np.dot(returns.mean().values * 252, weights))
        cov = returns.cov().values * 252
        vol = float(np.sqrt(max(1e-12, weights.T @ cov @ weights)))
        rf = 0.02
        return (mu - rf) / vol if vol > 0 else 0.0

    def _weighted_sharpe_score(self, prices_df: pd.DataFrame, weights: Dict[str, float]) -> float:
        returns = prices_df.pct_change().dropna()
        if returns.empty:
            return 50.0

        sharpe_values = []
        for symbol in returns.columns:
            r = returns[symbol].dropna()
            if len(r) < 30:
                continue
            mu = float(r.mean() * 252)
            vol = float(r.std() * np.sqrt(252))
            sharpe = (mu - 0.02) / vol if vol > 0 else 0.0
            sharpe_values.append((symbol, sharpe))

        if not sharpe_values:
            return 50.0

        weighted = 0.0
        for symbol, sharpe in sharpe_values:
            norm_sharpe = max(0.0, min(1.0, (sharpe + 1.0) / 3.0))
            weighted += weights.get(symbol, 0.0) * (norm_sharpe * 100.0)

        return float(max(0.0, min(100.0, weighted)))


portfolio_analyzer = PortfolioAnalyzer()
