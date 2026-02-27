import { useEffect, useState } from "react";
import { marketAPI, IndexQuote } from "@/lib/api";

export function MarketTicker() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);

  useEffect(() => {
    const fetch = () => {
      marketAPI.getIndices().then(setIndices).catch(() => {});
    };
    fetch();
    const id = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (indices.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...indices, ...indices];

  return (
    <div
      className="ticker-bar overflow-hidden whitespace-nowrap flex-shrink-0"
      style={{
        borderBottom: "1px solid hsl(var(--border))",
        background: "hsl(0 0% 3.5%)",
        height: 28,
      }}
    >
      <div className="ticker-track inline-flex items-center h-full">
        {items.map((q, i) => (
          <span key={`${q.symbol}-${i}`} className="inline-flex items-center gap-1.5 px-4 text-[10px]">
            <span className="text-muted-foreground font-medium tracking-wide">{q.name}</span>
            <span className="text-foreground">{q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={q.change_percent >= 0 ? "text-primary" : "text-destructive"}>
              {q.change_percent >= 0 ? "+" : ""}{q.change_percent.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
