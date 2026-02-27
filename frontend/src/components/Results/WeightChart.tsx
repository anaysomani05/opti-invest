import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { WeightSnapshot } from "@/lib/api";

const COLORS = [
  "hsl(152, 60%, 42%)",
  "hsl(38, 90%, 55%)",
  "hsl(200, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(340, 70%, 55%)",
  "hsl(60, 70%, 50%)",
  "hsl(170, 60%, 45%)",
  "hsl(310, 50%, 50%)",
  "hsl(20, 80%, 55%)",
  "hsl(240, 60%, 55%)",
];

interface Props {
  snapshots: WeightSnapshot[];
}

export const WeightChart = ({ snapshots }: Props) => {
  if (snapshots.length < 2) return null;

  // Get all symbols across all snapshots
  const allSymbols = new Set<string>();
  for (const s of snapshots) {
    for (const sym of Object.keys(s.weights)) {
      allSymbols.add(sym);
    }
  }
  const symbols = Array.from(allSymbols).sort();

  const data = snapshots.map((s) => {
    const row: Record<string, string | number> = { date: s.date };
    for (const sym of symbols) {
      row[sym] = Math.round((s.weights[sym] || 0) * 100);
    }
    return row;
  });

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header">
        <span className="label">WEIGHT EVOLUTION</span>
      </div>
      <div className="px-3 py-3" style={{ height: "260px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "hsl(0, 0%, 45%)" }}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
              stroke="hsl(0, 0%, 20%)"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(0, 0%, 45%)" }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
              stroke="hsl(0, 0%, 20%)"
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 8%)",
                border: "1px solid hsl(0, 0%, 20%)",
                fontSize: "10px",
                fontFamily: "JetBrains Mono, monospace",
              }}
              formatter={(v: number) => [`${v}%`, ""]}
            />
            {symbols.map((sym, i) => (
              <Area
                key={sym}
                type="monotone"
                dataKey={sym}
                stackId="1"
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
