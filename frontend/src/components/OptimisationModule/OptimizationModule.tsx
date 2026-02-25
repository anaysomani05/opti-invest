import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  BarChart3,
  Shield,
  Zap,
  Calculator,
  AlertTriangle,
  Loader2,
  PieChart,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import {
  portfolioAPI,
  optimizationAPI,
  type OptimizationRequest,
  type OptimizationResult,
  type HoldingWithMetrics,
} from "@/lib/api";

interface Props {
  onNavigateToPortfolio?: () => void;
}

type ActiveTab = "comparison" | "rebalancing" | "frontier" | "metrics";

const RISK_META = {
  conservative: { icon: Shield, label: "CONSERVATIVE", desc: "Min volatility, stable returns" },
  moderate: { icon: BarChart3, label: "MODERATE", desc: "Balanced risk / return" },
  aggressive: { icon: Zap, label: "AGGRESSIVE", desc: "Max Sharpe, high potential" },
};

export const OptimizationModule = ({ onNavigateToPortfolio }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [riskProfile, setRiskProfile] = useState("moderate");
  const [activeTab, setActiveTab] = useState<ActiveTab>("comparison");

  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } =
    useQuery<HoldingWithMetrics[]>({
      queryKey: ["holdings-with-metrics"],
      queryFn: portfolioAPI.getHoldingsWithMetrics,
      staleTime: 10 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    });

  const { data: riskProfiles = [], error: profilesError } = useQuery({
    queryKey: ["risk-profiles"],
    queryFn: optimizationAPI.getRiskProfiles,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const currentWeights = useMemo(() => {
    const total = holdings.reduce((s, h) => s + h.value, 0);
    if (!total) return {} as Record<string, number>;
    return Object.fromEntries(
      holdings.map((h) => [h.symbol, (h.value / total) * 100])
    );
  }, [holdings]);

  const portfolioMetrics = useMemo(() => {
    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    const totalGL = holdings.reduce((s, h) => s + h.gain_loss, 0);
    const costBasis = totalValue - totalGL;
    return {
      totalValue,
      totalGL,
      returnPct: costBasis > 0 ? (totalGL / costBasis) * 100 : 0,
    };
  }, [holdings]);

  const optimizeMutation = useMutation({
    mutationFn: (req: OptimizationRequest) => optimizationAPI.optimizePortfolio(req),
    onSuccess: (result) => {
      toast({
        title: "Optimization complete",
        description: `Sharpe ratio: ${result.sharpe_ratio.toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["optimization-results"] });
    },
    onError: (e: any) => {
      toast({
        title: "Optimization failed",
        description: e.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOptimize = () => {
    if (!holdings.length) {
      toast({
        title: "No holdings",
        description: "Add holdings to your portfolio first.",
        variant: "destructive",
      });
      return;
    }
    const currentPrices: Record<string, number> = {};
    holdings.forEach((h) => (currentPrices[h.symbol] = h.current_price));
    optimizeMutation.mutate({
      risk_profile: riskProfile,
      objective: "max_sharpe",
      lookback_period: 252,
      current_prices: currentPrices,
    });
  };

  const result = optimizeMutation.data;
  const frontier = result?.efficient_frontier ?? [];

  // ── Backend down: show static preview ──────────────────────────
  if (holdingsError || profilesError) {
    return (
      <div className="px-5 py-8 text-center">
        <AlertTriangle
          className="w-6 h-6 mx-auto mb-3"
          style={{ color: "hsl(var(--warning))" }}
        />
        <div className="text-xs text-muted-foreground tracking-wider mb-1">
          BACKEND UNAVAILABLE
        </div>
        <div className="text-[11px] text-muted-foreground">
          Start the backend server at localhost:8000
        </div>
      </div>
    );
  }

  if (holdingsLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-xs tracking-wider">
        <Loader2 className="w-4 h-4 animate-spin" />
        LOADING...
      </div>
    );
  }

  // ── No holdings ────────────────────────────────────────────────
  if (!holdings.length) {
    return (
      <div className="py-16 text-center">
        <PieChart
          className="w-8 h-8 mx-auto mb-3"
          style={{ color: "hsl(var(--muted-foreground))" }}
        />
        <div className="text-xs text-muted-foreground tracking-[0.15em] mb-4">
          NO HOLDINGS — OPTIMIZATION REQUIRES AT LEAST 3 POSITIONS
        </div>
        <button className="btn-terminal" onClick={onNavigateToPortfolio}>
          GO TO PORTFOLIO
        </button>
      </div>
    );
  }

  // ── Validation warning ─────────────────────────────────────────
  const notReady = holdings.length < 3;

  return (
    <div>
      {notReady && (
        <div
          className="flex items-center gap-2 px-5 py-2 text-xs"
          style={{
            borderBottom: "1px solid hsl(var(--border))",
            color: "hsl(var(--warning))",
            background: "hsl(var(--warning) / 0.06)",
          }}
        >
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          Need at least 3 holdings for optimization ({holdings.length} currently)
        </div>
      )}

      {/* ── Risk profile + run ───────────────────────────────────── */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <div className="label mb-3">Risk Profile</div>
        <div className="flex items-stretch gap-2 mb-4">
          {(["conservative", "moderate", "aggressive"] as const).map((id) => {
            const meta = RISK_META[id];
            const profile = riskProfiles.find((p) => p.id === id);
            const Icon = meta.icon;
            const active = riskProfile === id;
            return (
              <button
                key={id}
                onClick={() => setRiskProfile(id)}
                className="flex-1 p-3 text-left transition-colors"
                style={{
                  border: `1px solid ${active ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                  background: active ? "hsl(var(--primary) / 0.06)" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{
                      color: active
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground))",
                    }}
                  />
                  <span
                    className="text-[10px] tracking-[0.15em] font-medium"
                    style={{
                      color: active
                        ? "hsl(var(--foreground))"
                        : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  {meta.desc}
                </div>
                {profile && (
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>
                      Return:{" "}
                      <span className="text-foreground">
                        {(profile.target_return * 100).toFixed(0)}–
                        {((profile.target_return + 0.04) * 100).toFixed(0)}%
                      </span>
                    </span>
                    <span>
                      Max vol:{" "}
                      <span className="text-foreground">
                        {(profile.max_volatility * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          className="btn-terminal-primary flex items-center gap-2"
          onClick={handleOptimize}
          disabled={optimizeMutation.isPending || notReady}
        >
          {optimizeMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Calculator className="w-3.5 h-3.5" />
          )}
          {optimizeMutation.isPending ? "OPTIMIZING..." : "RUN OPTIMIZATION"}
        </button>
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Metrics strip */}
          <div
            className="grid grid-cols-4"
            style={{ borderBottom: "1px solid hsl(var(--border))" }}
          >
            {[
              {
                label: "Expected Return",
                value: `${(result.expected_return * 100).toFixed(1)}%`,
                color: "primary",
              },
              {
                label: "Volatility",
                value: `${(result.volatility * 100).toFixed(1)}%`,
                color: "foreground",
              },
              {
                label: "Sharpe Ratio",
                value: result.sharpe_ratio.toFixed(2),
                color: "chart-2",
              },
              {
                label: "CVaR (95%)",
                value: result.cvar ? `${(result.cvar * 100).toFixed(1)}%` : "N/A",
                color: "warning",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="metric-cell">
                <div className="label mb-1">{label}</div>
                <div
                  className="stat-value"
                  style={{ color: `hsl(var(--${color}))` }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Sub-tabs */}
          <div
            className="flex items-center gap-0"
            style={{ borderBottom: "1px solid hsl(var(--border))" }}
          >
            {(
              [
                { id: "comparison", label: "ALLOCATION" },
                { id: "rebalancing", label: "REBALANCING" },
                { id: "frontier", label: "EFF. FRONTIER" },
                { id: "metrics", label: "METRICS" },
              ] as { id: ActiveTab; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                className="text-[10px] tracking-[0.14em] px-4 py-2.5 transition-colors"
                style={{
                  color:
                    activeTab === id
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                  borderBottom:
                    activeTab === id
                      ? "1px solid hsl(var(--primary))"
                      : "1px solid transparent",
                  marginBottom: "-1px",
                }}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Allocation comparison */}
          {activeTab === "comparison" && (
            <div
              className="grid grid-cols-2"
              style={{ borderBottom: "1px solid hsl(var(--border))" }}
            >
              {/* Current */}
              <div style={{ borderRight: "1px solid hsl(var(--border))" }}>
                <div className="section-header">
                  <span className="label">Current Allocation</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      <th className="th-left">Symbol</th>
                      <th className="th">Weight</th>
                      <th className="th" style={{ width: "100px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(currentWeights)
                      .sort((a, b) => b[1] - a[1])
                      .map(([sym, w]) => (
                        <tr key={sym} className="tr">
                          <td className="td-left" style={{ color: "hsl(var(--primary))" }}>
                            {sym}
                          </td>
                          <td className="td">{w.toFixed(1)}%</td>
                          <td className="td">
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${w}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Optimized */}
              <div>
                <div className="section-header">
                  <span className="label">Optimized Allocation</span>
                  <span className="text-[10px] text-muted-foreground tracking-wider">
                    {result.optimization_method?.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      <th className="th-left">Symbol</th>
                      <th className="th">Weight</th>
                      <th className="th">Δ</th>
                      <th className="th" style={{ width: "80px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.optimal_weights)
                      .sort((a, b) => b[1] - a[1])
                      .map(([sym, w]) => {
                        const wPct = w * 100;
                        const delta = wPct - (currentWeights[sym] ?? 0);
                        const isUp = delta > 0.5;
                        const isDown = delta < -0.5;
                        return (
                          <tr key={sym} className="tr">
                            <td className="td-left" style={{ color: "hsl(var(--primary))" }}>
                              {sym}
                            </td>
                            <td className="td">{wPct.toFixed(1)}%</td>
                            <td
                              className="td text-xs"
                              style={{
                                color: isUp
                                  ? "hsl(var(--primary))"
                                  : isDown
                                  ? "hsl(var(--destructive))"
                                  : "hsl(var(--muted-foreground))",
                              }}
                            >
                              {isUp ? "+" : ""}
                              {delta.toFixed(1)}%
                            </td>
                            <td className="td">
                              <div className="bar-track">
                                <div
                                  className="bar-fill"
                                  style={{ width: `${wPct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rebalancing */}
          {activeTab === "rebalancing" && (
            <div>
              <div className="section-header">
                <span className="label">Rebalancing Trades</span>
                <span className="text-[10px] text-muted-foreground">
                  Total portfolio value: ${portfolioMetrics.totalValue.toLocaleString()}
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    <th className="th-left">Action</th>
                    <th className="th-left">Symbol</th>
                    <th className="th">Amount</th>
                    <th className="th">% of Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.rebalancing_trades)
                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                    .map(([sym, amount]) => {
                      const isBuy = amount > 0;
                      const pct = (Math.abs(amount) / portfolioMetrics.totalValue) * 100;
                      return (
                        <tr key={sym} className="tr">
                          <td className="td-left">
                            <span
                              className="text-[10px] tracking-[0.15em] px-2 py-0.5 font-medium"
                              style={{
                                border: `1px solid hsl(var(--${isBuy ? "primary" : "destructive"}))`,
                                color: `hsl(var(--${isBuy ? "primary" : "destructive"}))`,
                              }}
                            >
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td
                            className="td-left font-semibold"
                            style={{ color: "hsl(var(--primary))" }}
                          >
                            {sym}
                          </td>
                          <td
                            className="td font-semibold"
                            style={{
                              color: `hsl(var(--${isBuy ? "primary" : "destructive"}))`,
                            }}
                          >
                            {isBuy ? "+" : "-"}$
                            {Math.abs(amount).toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="td text-muted-foreground">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Efficient Frontier */}
          {activeTab === "frontier" && (
            <div className="p-5">
              <div className="label mb-3">EFFICIENT FRONTIER ({frontier.length} POINTS)</div>
              {frontier.length > 0 ? (
                <>
                  <div
                    className="p-4"
                    style={{ border: "1px solid hsl(var(--border))" }}
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <ScatterChart
                        margin={{ top: 20, right: 40, bottom: 40, left: 40 }}
                      >
                        <CartesianGrid
                          strokeDasharray="2 2"
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          type="number"
                          dataKey="volatility"
                          name="Volatility"
                          tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          label={{
                            value: "VOLATILITY",
                            position: "insideBottom",
                            offset: -20,
                            fontSize: 10,
                            fill: "hsl(var(--muted-foreground))",
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="expected_return"
                          name="Return"
                          tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          label={{
                            value: "RETURN",
                            angle: -90,
                            position: "insideLeft",
                            offset: 15,
                            fontSize: 10,
                            fill: "hsl(var(--muted-foreground))",
                          }}
                        />
                        <Tooltip
                          cursor={{ stroke: "hsl(var(--border))" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div
                                className="px-3 py-2 text-xs"
                                style={{
                                  background: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                }}
                              >
                                <div style={{ color: "hsl(var(--primary))" }}>
                                  Return: {(d.expected_return * 100).toFixed(2)}%
                                </div>
                                <div className="text-muted-foreground">
                                  Volatility: {(d.volatility * 100).toFixed(2)}%
                                </div>
                                <div style={{ color: "hsl(var(--chart-2))" }}>
                                  Sharpe: {d.sharpe_ratio.toFixed(3)}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Scatter
                          data={frontier.map((p) => ({
                            volatility: p.volatility,
                            expected_return: p.expected_return,
                            sharpe_ratio: p.sharpe_ratio,
                          }))}
                          fill="hsl(var(--primary))"
                        >
                          {frontier.map((p, i) => {
                            const maxSharpe = Math.max(...frontier.map((x) => x.sharpe_ratio));
                            const isOptimal = Math.abs(p.sharpe_ratio - maxSharpe) < 0.001;
                            return (
                              <Cell
                                key={i}
                                fill={
                                  isOptimal
                                    ? "hsl(var(--warning))"
                                    : "hsl(var(--primary))"
                                }
                                opacity={isOptimal ? 1 : 0.6}
                              />
                            );
                          })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-6 mt-3 text-[10px] text-muted-foreground tracking-wider">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: "hsl(var(--primary))" }}
                      />
                      FRONTIER POINTS
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: "hsl(var(--warning))" }}
                      />
                      OPTIMAL (MAX SHARPE)
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground tracking-wider">
                  RUN OPTIMIZATION TO GENERATE FRONTIER
                </div>
              )}
            </div>
          )}

          {/* Metrics */}
          {activeTab === "metrics" && (
            <div
              className="grid grid-cols-2"
              style={{ borderBottom: "1px solid hsl(var(--border))" }}
            >
              <div style={{ borderRight: "1px solid hsl(var(--border))" }}>
                <div className="section-header">
                  <span className="label">Current Portfolio</span>
                </div>
                <table className="w-full">
                  <tbody>
                    {[
                      ["Total Value", `$${portfolioMetrics.totalValue.toLocaleString()}`],
                      ["Holdings", holdings.length.toString()],
                      [
                        "Total P&L",
                        `${portfolioMetrics.totalGL >= 0 ? "+" : "-"}$${Math.abs(portfolioMetrics.totalGL).toLocaleString()}`,
                      ],
                      ["Return", `${portfolioMetrics.returnPct >= 0 ? "+" : ""}${portfolioMetrics.returnPct.toFixed(2)}%`],
                    ].map(([label, val]) => (
                      <tr key={label} className="tr">
                        <td className="td-left text-muted-foreground">{label}</td>
                        <td className="td">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="section-header">
                  <span className="label">Optimized Portfolio</span>
                </div>
                <table className="w-full">
                  <tbody>
                    {[
                      [
                        "Expected Return",
                        `${(result.expected_return * 100).toFixed(1)}%`,
                        "primary",
                      ],
                      [
                        "Volatility",
                        `${(result.volatility * 100).toFixed(1)}%`,
                        "foreground",
                      ],
                      [
                        "Sharpe Ratio",
                        result.sharpe_ratio.toFixed(2),
                        "chart-2",
                      ],
                      [
                        "CVaR (95%)",
                        result.cvar ? `${(result.cvar * 100).toFixed(1)}%` : "N/A",
                        "warning",
                      ],
                      [
                        "Max Drawdown",
                        result.max_drawdown
                          ? `${(result.max_drawdown * 100).toFixed(1)}%`
                          : "N/A",
                        "destructive",
                      ],
                    ].map(([label, val, color]) => (
                      <tr key={label} className="tr">
                        <td className="td-left text-muted-foreground">{label}</td>
                        <td
                          className="td font-semibold"
                          style={{ color: `hsl(var(--${color}))` }}
                        >
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
