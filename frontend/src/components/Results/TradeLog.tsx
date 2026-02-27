import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BacktestTrade } from "@/lib/api";

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  trades: BacktestTrade[];
}

export const TradeLog = ({ trades }: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (trades.length === 0) return null;

  // Group trades by date
  const grouped = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    const group = grouped.get(t.date) || [];
    group.push(t);
    grouped.set(t.date, group);
  }

  const dates = Array.from(grouped.keys()).sort();
  const displayDates = expanded ? dates : dates.slice(0, 3);

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header">
        <div className="flex items-center justify-between w-full">
          <span className="label">TRADE LOG</span>
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors tracking-wider"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronDown className="w-3 h-3" />
                COLLAPSE
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" />
                {dates.length} REBALANCES
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <th className="th-left">Date</th>
              <th className="th">Symbol</th>
              <th className="th">Action</th>
              <th className="th">Shares</th>
              <th className="th">Amount</th>
              <th className="th">Cost</th>
            </tr>
          </thead>
          <tbody>
            {displayDates.map((date) =>
              grouped.get(date)!.map((t, i) => (
                <tr key={`${date}-${t.symbol}-${i}`} className="tr">
                  <td className="td-left text-muted-foreground">
                    {i === 0 ? date : ""}
                  </td>
                  <td className="td" style={{ color: "hsl(var(--primary))" }}>
                    {t.symbol}
                  </td>
                  <td
                    className="td"
                    style={{
                      color: `hsl(var(--${t.action === "BUY" ? "primary" : "destructive"}))`,
                    }}
                  >
                    {t.action}
                  </td>
                  <td className="td">{t.shares.toFixed(2)}</td>
                  <td className="td">{fmt$(t.amount)}</td>
                  <td className="td text-muted-foreground">{fmt$(t.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!expanded && dates.length > 3 && (
        <div className="px-5 py-2">
          <button
            className="text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(true)}
          >
            + {dates.length - 3} MORE REBALANCES
          </button>
        </div>
      )}
    </div>
  );
};
