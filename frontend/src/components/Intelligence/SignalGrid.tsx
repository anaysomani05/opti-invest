import type { StockSignal } from "@/lib/api";
import { SignalCard } from "./SignalCard";

interface Props {
  signals: StockSignal[];
}

export const SignalGrid = ({ signals }: Props) => {
  if (!signals.length) {
    return (
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-2">Trading Signals</div>
        <div className="text-xs text-muted-foreground">No signals generated yet.</div>
      </section>
    );
  }

  const buys = signals.filter((s) => s.action === "BUY");
  const holds = signals.filter((s) => s.action === "HOLD");
  const sells = signals.filter((s) => s.action === "SELL");

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="label">Trading Signals</div>
        <div className="flex items-center gap-3 text-[10px] tracking-wider">
          {buys.length > 0 && (
            <span style={{ color: "hsl(var(--primary))" }}>{buys.length} BUY</span>
          )}
          {holds.length > 0 && (
            <span style={{ color: "hsl(var(--warning))" }}>{holds.length} HOLD</span>
          )}
          {sells.length > 0 && (
            <span style={{ color: "hsl(var(--destructive))" }}>{sells.length} SELL</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {signals.map((s) => (
          <SignalCard key={s.symbol} signal={s} />
        ))}
      </div>
    </section>
  );
};
