import type { StockSignal } from "@/lib/api";

interface Props {
  signal: StockSignal;
}

const ACTION_STYLES: Record<string, { border: string; bg: string; color: string }> = {
  BUY: {
    border: "hsl(var(--primary))",
    bg: "hsl(var(--primary) / 0.06)",
    color: "hsl(var(--primary))",
  },
  HOLD: {
    border: "hsl(var(--warning))",
    bg: "hsl(var(--warning) / 0.06)",
    color: "hsl(var(--warning))",
  },
  SELL: {
    border: "hsl(var(--destructive))",
    bg: "hsl(var(--destructive) / 0.06)",
    color: "hsl(var(--destructive))",
  },
};

export const SignalCard = ({ signal }: Props) => {
  const style = ACTION_STYLES[signal.action] || ACTION_STYLES.HOLD;

  return (
    <div
      className="p-3 border rounded-sm"
      style={{ borderColor: style.border, background: style.bg }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{signal.symbol}</span>
        <span
          className="text-[10px] tracking-wider font-medium px-2 py-0.5 border rounded-sm"
          style={{ borderColor: style.color, color: style.color }}
        >
          {signal.action}
        </span>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{
              width: `${Math.round(signal.confidence * 100)}%`,
              background: style.color,
            }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {Math.round(signal.confidence * 100)}%
        </span>
      </div>

      {/* Reasoning */}
      <div className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
        {signal.reasoning}
      </div>

      {/* Factors */}
      {signal.factors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {signal.factors.map((f) => (
            <span
              key={f.source}
              className="text-[9px] tracking-wider px-1.5 py-0.5 border rounded-sm"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              {f.source.toUpperCase()}: {f.signal}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
