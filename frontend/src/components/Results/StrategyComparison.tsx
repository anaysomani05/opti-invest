import type { BacktestResult } from "@/lib/api";

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

interface MetricRow {
  label: string;
  key: string;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricRow[] = [
  { label: "Total Return", key: "total_return", format: fmtPct, higherIsBetter: true },
  { label: "CAGR", key: "cagr", format: fmtPct, higherIsBetter: true },
  { label: "Sharpe Ratio", key: "sharpe", format: (v) => v.toFixed(2), higherIsBetter: true },
  { label: "Sortino Ratio", key: "sortino", format: (v) => v.toFixed(2), higherIsBetter: true },
  { label: "Max Drawdown", key: "max_drawdown", format: (v) => fmtPct(-v), higherIsBetter: false },
  { label: "DD Duration (days)", key: "max_drawdown_duration_days", format: (v) => `${v}`, higherIsBetter: false },
  { label: "Volatility", key: "volatility", format: fmtPct, higherIsBetter: false },
  { label: "Calmar Ratio", key: "calmar_ratio", format: (v) => v.toFixed(2), higherIsBetter: true },
  { label: "CVaR 95%", key: "cvar_95", format: fmtPct, higherIsBetter: false },
  { label: "Win Rate (Monthly)", key: "win_rate_monthly", format: fmtPct, higherIsBetter: true },
  { label: "Best Month", key: "best_month", format: fmtPct, higherIsBetter: true },
  { label: "Worst Month", key: "worst_month", format: fmtPct, higherIsBetter: false },
  { label: "Transaction Costs", key: "total_transaction_costs", format: (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, higherIsBetter: false },
];

interface Props {
  results: BacktestResult[];
}

export const StrategyComparison = ({ results }: Props) => {
  if (results.length < 2) return null;

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header">
        <span className="label">STRATEGY COMPARISON</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <th className="th-left" style={{ minWidth: "140px" }}>Metric</th>
              {results.map((r) => (
                <th key={r.strategy} className="th" style={{ minWidth: "100px" }}>
                  {r.strategy_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => {
              const values = results.map(
                (r) => (r.metrics as any)[metric.key] as number
              );
              const bestIdx = metric.higherIsBetter
                ? values.indexOf(Math.max(...values))
                : values.indexOf(Math.min(...values));

              return (
                <tr key={metric.key} className="tr">
                  <td className="td-left text-muted-foreground">{metric.label}</td>
                  {results.map((r, i) => {
                    const val = (r.metrics as any)[metric.key] as number;
                    return (
                      <td
                        key={r.strategy}
                        className="td"
                        style={{
                          color: i === bestIdx ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                          fontWeight: i === bestIdx ? 600 : 400,
                        }}
                      >
                        {metric.format(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
