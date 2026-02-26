import type { DiscoverySuggestion } from "@/lib/api";

interface Props {
  suggestions: DiscoverySuggestion[];
}

export const DiscoveryPanel = ({ suggestions }: Props) => {
  if (!suggestions.length) {
    return (
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-2">Discovery</div>
        <div className="text-xs text-muted-foreground">No new opportunities found.</div>
      </section>
    );
  }

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">Discovery — New Opportunities</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.map((s) => (
          <div
            key={s.symbol}
            className="p-3 border rounded-sm"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{s.symbol}</span>
              <span
                className="text-[9px] tracking-wider px-1.5 py-0.5 border rounded-sm"
                style={{ borderColor: "hsl(var(--primary) / 0.4)", color: "hsl(var(--primary))" }}
              >
                {s.sector}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mb-1">{s.name}</div>
            <div className="text-[11px] mb-2">{s.reason}</div>
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              {s.metrics?.trailing_pe != null && (
                <span>PE: {Number(s.metrics.trailing_pe).toFixed(1)}</span>
              )}
              {s.metrics?.momentum_6m != null && (
                <span>Mom: {(Number(s.metrics.momentum_6m) * 100).toFixed(1)}%</span>
              )}
              <span className="ml-auto" style={{ color: "hsl(var(--primary))" }}>
                Score: {s.score.toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
