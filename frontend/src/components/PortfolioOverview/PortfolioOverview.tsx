import { useQuery } from "@tanstack/react-query";
import { portfolioAPI } from "@/lib/api";
import { TrendingUp, TrendingDown } from "lucide-react";

const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtPct = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export const PortfolioOverview = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: portfolioAPI.getOverview,
    refetchInterval: 30000,
  });

  const summary = data?.summary ?? {
    total_value: 0,
    total_gain_loss: 0,
    total_gain_loss_percent: 0,
    holdings_count: 0,
  };
  const holdings = data?.holdings ?? [];
  const sectorEntries = Object.entries(data?.sector_allocation ?? {}).sort(
    (a, b) => b[1] - a[1]
  );

  const isGain = summary.total_gain_loss >= 0;

  return (
    <div>
      {/* ── Top metrics strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="metric-cell">
          <div className="label mb-2">Portfolio Value</div>
          <div className="stat-value">
            {isLoading ? "—" : fmt$(summary.total_value)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 tracking-wider">
            {summary.holdings_count} positions
          </div>
        </div>

        <div className="metric-cell">
          <div className="label mb-2">Total Return</div>
          <div
            className="stat-value"
            style={{ color: `hsl(var(--${isGain ? "primary" : "destructive"}))` }}
          >
            {isLoading
              ? "—"
              : `${isGain ? "+" : "-"}${fmt$(summary.total_gain_loss)}`}
          </div>
          <div
            className="text-[10px] mt-1 tracking-wider"
            style={{ color: `hsl(var(--${isGain ? "primary" : "destructive"}))` }}
          >
            {isLoading ? "" : fmtPct(summary.total_gain_loss_percent)}
          </div>
        </div>

        <div className="metric-cell">
          <div className="label mb-2">Sectors</div>
          <div className="stat-value">{sectorEntries.length || "—"}</div>
          <div className="text-[10px] text-muted-foreground mt-1 tracking-wider">
            {sectorEntries.length > 0 ? "diversified" : "no data"}
          </div>
        </div>

        <div className="metric-cell" style={{ borderRight: 0 }}>
          <div className="label mb-2">Holdings</div>
          <div className="stat-value">{summary.holdings_count}</div>
          <div className="text-[10px] text-muted-foreground mt-1 tracking-wider">
            active positions
          </div>
        </div>
      </div>

      {/* ── Positions table ───────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="section-header">
          <span className="label">Positions</span>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-xs tracking-wider">
            LOADING...
          </div>
        ) : holdings.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-xs tracking-wider">
            NO POSITIONS — ADD HOLDINGS IN THE PORTFOLIO TAB
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <th className="th-left">Symbol</th>
                <th className="th">Qty</th>
                <th className="th">Buy Price</th>
                <th className="th">Current</th>
                <th className="th">Value</th>
                <th className="th">P&amp;L</th>
                <th className="th">P&amp;L %</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const current = h.current_price;
                const value = current ? h.quantity * current : null;
                const gainLoss = current
                  ? (current - h.buy_price) * h.quantity
                  : null;
                const gainLossPct = current
                  ? ((current - h.buy_price) / h.buy_price) * 100
                  : null;
                const pos = gainLoss !== null && gainLoss >= 0;

                return (
                  <tr key={h.id} className="tr">
                    <td className="td-left">
                      <div className="flex items-center gap-2">
                        {gainLoss !== null ? (
                          pos ? (
                            <TrendingUp
                              className="w-3 h-3"
                              style={{ color: "hsl(var(--primary))" }}
                            />
                          ) : (
                            <TrendingDown
                              className="w-3 h-3"
                              style={{ color: "hsl(var(--destructive))" }}
                            />
                          )
                        ) : null}
                        <span
                          className="font-semibold"
                          style={{ color: "hsl(var(--primary))" }}
                        >
                          {h.symbol}
                        </span>
                      </div>
                    </td>
                    <td className="td">{h.quantity.toLocaleString()}</td>
                    <td className="td">${h.buy_price.toFixed(2)}</td>
                    <td className="td">
                      {current ? `$${current.toFixed(2)}` : "—"}
                    </td>
                    <td className="td">{value ? fmt$(value) : "—"}</td>
                    <td
                      className="td"
                      style={{
                        color: gainLoss !== null
                          ? `hsl(var(--${pos ? "primary" : "destructive"}))`
                          : undefined,
                      }}
                    >
                      {gainLoss !== null
                        ? `${pos ? "+" : "-"}${fmt$(gainLoss)}`
                        : "—"}
                    </td>
                    <td
                      className="td"
                      style={{
                        color: gainLossPct !== null
                          ? `hsl(var(--${gainLossPct >= 0 ? "primary" : "destructive"}))`
                          : undefined,
                      }}
                    >
                      {gainLossPct !== null ? fmtPct(gainLossPct) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Sector allocation ────────────────────────────────────── */}
      {sectorEntries.length > 0 && (
        <div>
          <div className="section-header">
            <span className="label">Sector Allocation</span>
          </div>
          <div className="px-5 py-3 space-y-2.5">
            {sectorEntries.map(([sector, alloc]) => (
              <div key={sector} className="flex items-center gap-4">
                <div
                  className="text-xs text-muted-foreground tracking-wider"
                  style={{ width: "140px", flexShrink: 0 }}
                >
                  {sector.toUpperCase()}
                </div>
                <div className="flex-1 bar-track">
                  <div className="bar-fill" style={{ width: `${alloc}%` }} />
                </div>
                <div
                  className="text-xs text-right"
                  style={{ width: "42px", color: "hsl(var(--foreground))" }}
                >
                  {alloc.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
