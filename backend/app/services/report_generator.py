"""Generate a Markdown backtest summary report from a BacktestResult."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from app.models import BacktestResult, BacktestMetrics


def _fmt_pct(v: Optional[float], decimals: int = 2) -> str:
    if v is None:
        return "N/A"
    return f"{v * 100:.{decimals}f}%"


def _fmt_num(v: Optional[float], decimals: int = 2) -> str:
    if v is None:
        return "N/A"
    return f"{v:,.{decimals}f}"


def _fmt_money(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    return f"${v:,.2f}"


def _fmt_int(v: Optional[int]) -> str:
    if v is None:
        return "N/A"
    return f"{v:,}"


def _md_table(headers: List[str], rows: List[List[str]]) -> str:
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(cell))

    def _pad_row(cells: List[str]) -> str:
        padded = [c.ljust(col_widths[i]) for i, c in enumerate(cells)]
        return "| " + " | ".join(padded) + " |"

    lines = [
        _pad_row(headers),
        "| " + " | ".join("-" * w for w in col_widths) + " |",
    ]
    for row in rows:
        lines.append(_pad_row(row))
    return "\n".join(lines)


def generate_report(result: BacktestResult) -> str:
    """Build a full Markdown report from a BacktestResult."""
    sections: list[str] = []

    # ── Title ────────────────────────────────────────────────────────────
    sections.append(f"# Backtest Report: {result.strategy_name}")
    sections.append("")

    # ── Run Info ─────────────────────────────────────────────────────────
    meta = result.run_metadata
    if meta:
        sections.append("## Run Info")
        sections.append("")
        sections.append(f"- **Run ID**: `{meta.run_id}`")
        sections.append(f"- **Timestamp**: {meta.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        sections.append(f"- **Config Hash**: `{meta.config_hash}`")
        sections.append(f"- **Data Hash**: `{meta.data_hash}`")
        sections.append(f"- **Random Seed**: {meta.random_seed}")
        sections.append("")

    # ── Configuration ────────────────────────────────────────────────────
    cfg = result.config
    sections.append("## Configuration")
    sections.append("")
    sections.append(f"- **Symbols**: {', '.join(cfg.symbols)}")
    sections.append(f"- **Period**: {cfg.start_date} to {cfg.end_date}")
    sections.append(f"- **Initial Capital**: {_fmt_money(cfg.initial_capital)}")
    sections.append(f"- **Rebalance Frequency**: {cfg.rebalance_frequency}")
    sections.append(f"- **Lookback**: {cfg.lookback_days} days")
    sections.append(f"- **Benchmark**: {cfg.benchmark}")
    sections.append(f"- **Transaction Cost**: {cfg.transaction_cost_bps} bps")
    sections.append(f"- **Max Position Weight**: {_fmt_pct(cfg.max_position_weight)}")
    sections.append("")

    # ── Performance Summary ──────────────────────────────────────────────
    sections.append("## Performance Summary")
    sections.append("")

    def _metrics_row(label: str, m: BacktestMetrics) -> List[str]:
        return [
            label,
            _fmt_pct(m.cagr),
            _fmt_pct(m.volatility),
            _fmt_num(m.sharpe),
            _fmt_num(m.sortino),
            _fmt_pct(m.max_drawdown),
            _fmt_num(m.calmar_ratio),
            _fmt_pct(m.cvar_95),
            _fmt_pct(m.win_rate_monthly),
            _fmt_pct(m.best_month),
            _fmt_pct(m.worst_month),
            _fmt_money(m.total_transaction_costs),
        ]

    perf_headers = [
        "Metric", "CAGR", "Vol", "Sharpe", "Sortino",
        "MaxDD", "Calmar", "CVaR95", "WinRate",
        "BestMo", "WorstMo", "TxCosts",
    ]
    perf_rows = [
        _metrics_row("Portfolio", result.metrics),
        _metrics_row("Benchmark", result.benchmark_metrics),
    ]
    sections.append(_md_table(perf_headers, perf_rows))
    sections.append("")

    # ── Turnover & Costs ─────────────────────────────────────────────────
    sections.append("## Turnover & Costs")
    sections.append("")
    m = result.metrics
    sections.append(f"- **Avg Turnover**: {_fmt_pct(m.avg_turnover)}")
    sections.append(f"- **Total Rebalances**: {m.total_rebalances}")
    sections.append(f"- **Total Transaction Costs**: {_fmt_money(m.total_transaction_costs)}")
    if result.equity_curve:
        final_value = result.equity_curve[-1].portfolio_value
        cost_pct = m.total_transaction_costs / final_value if final_value else 0
        sections.append(f"- **Costs as % of Final Value**: {_fmt_pct(cost_pct)}")
    sections.append("")

    # ── Out-of-Sample Analysis ───────────────────────────────────────────
    if result.oos_report:
        oos = result.oos_report
        sections.append("## Out-of-Sample Analysis")
        sections.append("")
        oos_headers = ["Metric", "Value"]
        oos_rows = [
            ["Periods", str(oos.num_periods)],
            ["Avg OOS Return", _fmt_pct(oos.avg_oos_return)],
            ["Median OOS Return", _fmt_pct(oos.median_oos_return)],
            ["OOS Hit Rate", _fmt_pct(oos.oos_hit_rate)],
            ["OOS Sharpe", _fmt_num(oos.oos_sharpe_approx)],
            ["IS Sharpe", _fmt_num(oos.is_sharpe_approx)],
            ["Performance Decay", _fmt_pct(oos.performance_decay)],
        ]
        sections.append(_md_table(oos_headers, oos_rows))
        sections.append("")

    # ── Regime Analysis ──────────────────────────────────────────────────
    if result.regime_analysis and result.regime_analysis.regimes:
        ra = result.regime_analysis
        sections.append("## Regime Analysis")
        sections.append("")
        regime_headers = ["Regime", "Days", "Return", "Vol", "Sharpe", "MaxDD"]
        regime_rows = [
            [
                rp.regime,
                _fmt_int(rp.trading_days),
                _fmt_pct(rp.annualized_return),
                _fmt_pct(rp.volatility),
                _fmt_num(rp.sharpe),
                _fmt_pct(rp.max_drawdown),
            ]
            for rp in ra.regimes
        ]
        sections.append(_md_table(regime_headers, regime_rows))
        sections.append("")
        sections.append(f"- **Survives Crashes**: {'Yes' if ra.survives_crashes else 'No'}")
        sections.append(f"- **Crash Recovery Ratio**: {_fmt_num(ra.crash_recovery_ratio)}")
        sections.append("")

    # ── Walk-Forward Periods ─────────────────────────────────────────────
    if result.walk_forward_periods:
        sections.append("## Walk-Forward Periods")
        sections.append("")
        wf_headers = ["#", "Train Window", "Test Window", "Return"]
        wf_rows = [
            [
                str(i + 1),
                f"{p.train_start} → {p.train_end}",
                f"{p.test_start} → {p.test_end}",
                _fmt_pct(p.return_pct),
            ]
            for i, p in enumerate(result.walk_forward_periods)
        ]
        sections.append(_md_table(wf_headers, wf_rows))
        sections.append("")

    # ── Top Allocation Snapshots ─────────────────────────────────────────
    if result.weights_over_time:
        sections.append("## Top Allocation Snapshots")
        sections.append("")
        wots = result.weights_over_time
        # Pick first, middle, last
        indices = [0]
        if len(wots) > 2:
            indices.append(len(wots) // 2)
        if len(wots) > 1:
            indices.append(len(wots) - 1)

        for idx in indices:
            snap = wots[idx]
            sorted_weights = sorted(snap.weights.items(), key=lambda x: x[1], reverse=True)[:5]
            sections.append(f"### {snap.date}")
            sections.append("")
            snap_headers = ["Symbol", "Weight"]
            snap_rows = [[sym, _fmt_pct(w)] for sym, w in sorted_weights]
            sections.append(_md_table(snap_headers, snap_rows))
            sections.append("")

    # ── Footer ───────────────────────────────────────────────────────────
    sections.append("---")
    sections.append(f"*Report generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')} by OptiInvest Backtest Engine*")
    sections.append("")

    return "\n".join(sections)
