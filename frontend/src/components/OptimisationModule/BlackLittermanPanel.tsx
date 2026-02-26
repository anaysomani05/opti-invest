import type { BLOptimizationResult } from "@/lib/api";

interface Props {
  data: BLOptimizationResult;
}

export const BlackLittermanPanel = ({ data }: Props) => {
  const rows = Object.keys(data.optimal_weights)
    .map((symbol) => ({
      symbol,
      current: data.current_weights[symbol] || 0,
      optimal: data.optimal_weights[symbol] || 0,
    }))
    .sort((a, b) => b.optimal - a.optimal);

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="label">Black-Litterman Optimization</div>
        <div className="text-[9px] text-muted-foreground tracking-wider">
          {data.method.toUpperCase().replace(/_/g, " ")}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricBox label="Expected Return" value={`${(data.expected_return * 100).toFixed(1)}%`} />
        <MetricBox label="Volatility" value={`${(data.volatility * 100).toFixed(1)}%`} />
        <MetricBox label="Sharpe Ratio" value={data.sharpe_ratio.toFixed(2)} />
      </div>

      {/* BL Views */}
      {data.views.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] tracking-wider text-muted-foreground mb-2">VIEWS (AGENT SIGNALS)</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {data.views.map((v) => (
              <div key={v.symbol} className="p-2 border text-xs" style={{ borderColor: "hsl(var(--border))" }}>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">{v.symbol}</span>
                  <span
                    style={{
                      color:
                        v.expected_excess_return > 0
                          ? "hsl(var(--primary))"
                          : "hsl(var(--destructive))",
                    }}
                  >
                    {v.expected_excess_return > 0 ? "+" : ""}
                    {(v.expected_excess_return * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-[9px] text-muted-foreground">
                  conf: {(v.confidence * 100).toFixed(0)}% • {v.sources.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weights table */}
      <div className="text-[10px] tracking-wider text-muted-foreground mb-2">WEIGHT ALLOCATION</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <th className="text-left py-2">Symbol</th>
            <th className="text-right py-2">Current</th>
            <th className="text-right py-2">BL Optimal</th>
            <th className="text-right py-2">Delta</th>
            <th className="text-left py-2 pl-3">Allocation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = r.optimal - r.current;
            return (
              <tr key={r.symbol} className="border-b" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
                <td className="py-2 font-medium">{r.symbol}</td>
                <td className="text-right py-2">{(r.current * 100).toFixed(1)}%</td>
                <td className="text-right py-2">{(r.optimal * 100).toFixed(1)}%</td>
                <td
                  className="text-right py-2"
                  style={{ color: delta > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}
                >
                  {delta > 0 ? "+" : ""}
                  {(delta * 100).toFixed(1)}%
                </td>
                <td className="py-2 pl-3">
                  <div className="h-1.5 bg-muted w-24">
                    <div
                      className="h-1.5"
                      style={{
                        width: `${Math.min(100, r.optimal * 100 * 2.5)}%`,
                        background: "hsl(var(--primary))",
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

const MetricBox = ({ label, value }: { label: string; value: string }) => (
  <div className="border p-2" style={{ borderColor: "hsl(var(--border))" }}>
    <div className="text-[9px] tracking-wider text-muted-foreground mb-1">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);
