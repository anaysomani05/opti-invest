import type { RiskAgentOutput } from "@/lib/api";

interface Props {
  data: RiskAgentOutput;
}

export const RiskAgentPanel = ({ data }: Props) => {
  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">Risk Analysis</div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricBox label="CVaR 95%" value={`${((data.cvar_95 ?? 0) * 100).toFixed(1)}%`} warn={(data.cvar_95 ?? 0) < -0.2} />
        <MetricBox label="CVaR 99%" value={`${((data.cvar_99 ?? 0) * 100).toFixed(1)}%`} warn={(data.cvar_99 ?? 0) < -0.3} />
        <MetricBox label="Max Drawdown" value={`${((data.max_drawdown ?? 0) * 100).toFixed(1)}%`} warn={(data.max_drawdown ?? 0) < -0.25} />
        <MetricBox label="HHI (Conc.)" value={(data.hhi ?? 0).toFixed(3)} warn={(data.hhi ?? 0) > 0.25} />
      </div>

      {/* Stress tests */}
      {data.stress_tests.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] tracking-wider text-muted-foreground mb-2">STRESS TESTS</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <th className="text-left py-1.5">Scenario</th>
                <th className="text-right py-1.5">Impact</th>
                <th className="text-right py-1.5">Worst Hit</th>
                <th className="text-right py-1.5">Best</th>
              </tr>
            </thead>
            <tbody>
              {data.stress_tests.map((t) => (
                <tr key={t.scenario} className="border-b" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
                  <td className="py-1.5">{t.scenario}</td>
                  <td
                    className="text-right py-1.5"
                    style={{ color: t.portfolio_impact < -0.05 ? "hsl(var(--destructive))" : "hsl(var(--foreground))" }}
                  >
                    {(t.portfolio_impact * 100).toFixed(1)}%
                  </td>
                  <td className="text-right py-1.5" style={{ color: "hsl(var(--destructive))" }}>
                    {t.worst_hit}
                  </td>
                  <td className="text-right py-1.5" style={{ color: "hsl(var(--primary))" }}>
                    {t.best_performer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hedging suggestions */}
      {data.hedging_suggestions.length > 0 && (
        <div>
          <div className="text-[10px] tracking-wider text-muted-foreground mb-2">RECOMMENDATIONS</div>
          <div className="space-y-1">
            {data.hedging_suggestions.map((s, i) => (
              <div key={i} className="text-[11px] text-muted-foreground">→ {s}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const MetricBox = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className="border p-2" style={{ borderColor: warn ? "hsl(var(--destructive) / 0.5)" : "hsl(var(--border))" }}>
    <div className="text-[9px] tracking-wider text-muted-foreground mb-1">{label}</div>
    <div className="text-sm font-medium" style={{ color: warn ? "hsl(var(--destructive))" : "hsl(var(--foreground))" }}>
      {value}
    </div>
  </div>
);
