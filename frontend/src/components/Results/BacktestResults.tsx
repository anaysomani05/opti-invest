import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { BacktestResult } from "@/lib/api";
import { EquityCurve } from "./EquityCurve";
import { DrawdownChart } from "./DrawdownChart";
import { MonthlyReturns } from "./MonthlyReturns";
import { WeightChart } from "./WeightChart";
import { StrategyComparison } from "./StrategyComparison";
import { TradeLog } from "./TradeLog";

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Props {
  results: BacktestResult[];
  onRunNew: () => void;
}

export const BacktestResults = ({ results, onRunNew }: Props) => {
  const [activeResult, setActiveResult] = useState(0);

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-5">
        <div className="text-muted-foreground text-xs tracking-wider mb-4">
          NO BACKTEST RESULTS
        </div>
        <button className="btn-terminal-primary flex items-center gap-2" onClick={onRunNew}>
          <FlaskConical className="w-3 h-3" />
          RUN A BACKTEST
        </button>
      </div>
    );
  }

  const isCompare = results.length > 1;
  const result = results[activeResult] || results[0];
  const m = result.metrics;
  const bm = result.benchmark_metrics;

  const beatsBench = m.total_return > bm.total_return;

  const metricsData = [
    { label: "TOTAL RETURN", value: fmtPct(m.total_return), bench: fmtPct(bm.total_return), beats: m.total_return > bm.total_return },
    { label: "CAGR", value: fmtPct(m.cagr), bench: fmtPct(bm.cagr), beats: m.cagr > bm.cagr },
    { label: "SHARPE", value: m.sharpe.toFixed(2), bench: bm.sharpe.toFixed(2), beats: m.sharpe > bm.sharpe },
    { label: "MAX DD", value: fmtPct(-m.max_drawdown), bench: fmtPct(-bm.max_drawdown), beats: m.max_drawdown < bm.max_drawdown },
    { label: "VOLATILITY", value: fmtPct(m.volatility), bench: fmtPct(bm.volatility), beats: m.volatility < bm.volatility },
    { label: "TX COSTS", value: fmt$(m.total_transaction_costs), bench: "—", beats: true },
  ];

  return (
    <div>
      {/* ── Strategy tabs (compare mode) ─────────────────────────── */}
      {isCompare && (
        <div
          className="flex items-center gap-0 overflow-x-auto"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          {results.map((r, i) => (
            <button
              key={r.strategy}
              className="px-4 py-2 text-[10px] tracking-[0.15em] transition-colors flex-shrink-0"
              style={{
                borderBottom: i === activeResult
                  ? "2px solid hsl(var(--primary))"
                  : "2px solid transparent",
                color: i === activeResult ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              }}
              onClick={() => setActiveResult(i)}
            >
              {r.strategy_name.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* ── Metrics strip ─────────────────────────────────────────── */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${metricsData.length}, 1fr)`,
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        {metricsData.map((d) => (
          <div key={d.label} className="metric-cell">
            <div className="label mb-1">{d.label}</div>
            <div
              className="stat-value"
              style={{ color: `hsl(var(--${d.beats ? "primary" : "destructive"}))` }}
            >
              {d.value}
            </div>
            {d.bench !== "—" && (
              <div className="text-[9px] text-muted-foreground mt-0.5 tracking-wider">
                bench: {d.bench}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Strategy Comparison Table (compare mode) ──────────────── */}
      {isCompare && <StrategyComparison results={results} />}

      {/* ── Equity Curve ──────────────────────────────────────────── */}
      <EquityCurve results={isCompare ? results : [result]} />

      {/* ── Drawdown ──────────────────────────────────────────────── */}
      <DrawdownChart result={result} />

      {/* ── Monthly Returns ───────────────────────────────────────── */}
      <MonthlyReturns returns={result.monthly_returns} />

      {/* ── Weight Evolution ──────────────────────────────────────── */}
      <WeightChart snapshots={result.weights_over_time} />

      {/* ── Trade Log ─────────────────────────────────────────────── */}
      <TradeLog trades={result.trades} />

      {/* ── Run new ───────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <button className="btn-terminal flex items-center gap-2" onClick={onRunNew}>
          <FlaskConical className="w-3 h-3" />
          RUN NEW BACKTEST
        </button>
      </div>
    </div>
  );
};
