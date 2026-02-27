import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BacktestResult } from "@/lib/api";

interface Props {
  result: BacktestResult;
}

export const DrawdownChart = ({ result }: Props) => {
  // Calculate drawdown series from equity curve
  const eq = result.equity_curve;
  if (eq.length < 2) return null;

  let peak = eq[0].portfolio_value;
  const data = eq.map((pt) => {
    if (pt.portfolio_value > peak) peak = pt.portfolio_value;
    const dd = peak > 0 ? (pt.portfolio_value - peak) / peak : 0;
    return { date: pt.date, drawdown: Math.round(dd * 10000) / 100 };
  });

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header">
        <span className="label">DRAWDOWN</span>
      </div>
      <div className="px-3 py-3" style={{ height: "200px" }}>
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
              domain={["dataMin", 0]}
              stroke="hsl(0, 0%, 20%)"
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 8%)",
                border: "1px solid hsl(0, 0%, 20%)",
                fontSize: "10px",
                fontFamily: "JetBrains Mono, monospace",
              }}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]}
            />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke="hsl(0, 72%, 51%)"
              fill="hsl(0, 72%, 51%)"
              fillOpacity={0.15}
              strokeWidth={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
