import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { BacktestResult } from "@/lib/api";

const COLORS = [
  "hsl(152, 60%, 42%)",
  "hsl(38, 90%, 55%)",
  "hsl(200, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(340, 70%, 55%)",
];

interface Props {
  results: BacktestResult[];
}

export const EquityCurve = ({ results }: Props) => {
  const [logScale, setLogScale] = useState(false);

  if (results.length === 0) return null;

  // Build merged data
  const dateMap = new Map<string, Record<string, number>>();
  const benchKey = "benchmark";

  for (const r of results) {
    for (const pt of r.equity_curve) {
      const existing = dateMap.get(pt.date) || {};
      existing[r.strategy] = pt.portfolio_value;
      existing[benchKey] = pt.benchmark_value;
      dateMap.set(pt.date, existing);
    }
  }

  const data = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  const fmt$ = (v: number) =>
    `$${(v / 1000).toFixed(0)}K`;

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header flex items-center justify-between">
        <span className="label">EQUITY CURVE</span>
        <button
          className="text-[9px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLogScale(!logScale)}
        >
          {logScale ? "LINEAR" : "LOG"} SCALE
        </button>
      </div>
      <div className="px-3 py-3" style={{ height: "320px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "hsl(0, 0%, 45%)" }}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
              stroke="hsl(0, 0%, 20%)"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(0, 0%, 45%)" }}
              tickFormatter={fmt$}
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ["auto", "auto"] : ["dataMin", "dataMax"]}
              stroke="hsl(0, 0%, 20%)"
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 8%)",
                border: "1px solid hsl(0, 0%, 20%)",
                fontSize: "10px",
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelStyle={{ color: "hsl(0, 0%, 60%)" }}
              formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, ""]}
            />
            <Legend
              wrapperStyle={{ fontSize: "9px", fontFamily: "JetBrains Mono" }}
            />
            {results.map((r, i) => (
              <Line
                key={r.strategy}
                type="monotone"
                dataKey={r.strategy}
                name={r.strategy_name}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
            <Line
              type="monotone"
              dataKey={benchKey}
              name="Benchmark"
              stroke="hsl(0, 0%, 45%)"
              dot={false}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
