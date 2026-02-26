import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PieChart, Play, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  optimizationAPI,
  portfolioAPI,
  type HoldingWithMetrics,
  type StrategyConfig,
  type StrategyInfo,
  type StrategyOptimizationResult,
} from "@/lib/api";

interface Props {
  onNavigateToPortfolio?: () => void;
}

const STRATEGY_ORDER = ["mean_variance", "min_variance", "risk_parity", "black_litterman", "hrp"];

export const OptimizationModule = ({ onNavigateToPortfolio }: Props) => {
  const { toast } = useToast();
  const [selectedStrategy, setSelectedStrategy] = useState<string>("mean_variance");
  const [showConfig, setShowConfig] = useState(false);
  const [lookback, setLookback] = useState(252);
  const [riskFreeRate, setRiskFreeRate] = useState(0.04);
  const [minWeight, setMinWeight] = useState(0.01);
  const [maxWeight, setMaxWeight] = useState(0.40);
  const [riskAversion, setRiskAversion] = useState(2.5);
  const [linkageMethod, setLinkageMethod] = useState("single");

  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } =
    useQuery<HoldingWithMetrics[]>({
      queryKey: ["holdings-with-metrics"],
      queryFn: portfolioAPI.getHoldingsWithMetrics,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  const { data: strategies = [] } = useQuery<StrategyInfo[]>({
    queryKey: ["strategies"],
    queryFn: optimizationAPI.getStrategies,
    staleTime: 300_000,
  });

  const optimizeMutation = useMutation({
    mutationFn: (config: StrategyConfig) => optimizationAPI.runStrategy(config),
    onError: (e: any) => {
      toast({
        title: "Optimization failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const sortedStrategies = [...strategies].sort(
    (a, b) => STRATEGY_ORDER.indexOf(a.id) - STRATEGY_ORDER.indexOf(b.id)
  );

  const activeStrategy = strategies.find((s) => s.id === selectedStrategy);

  const runOptimization = () => {
    if (!holdings.length) return;
    const current_prices: Record<string, number> = {};
    for (const h of holdings) current_prices[h.symbol] = h.current_price;

    optimizeMutation.mutate({
      strategy: selectedStrategy,
      lookback_period: lookback,
      risk_free_rate: riskFreeRate,
      min_weight: minWeight,
      max_weight: maxWeight,
      current_prices,
      risk_aversion: riskAversion,
      linkage_method: linkageMethod,
    });
  };

  if (holdingsError) {
    return (
      <div className="px-5 py-8 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-3" style={{ color: "hsl(var(--warning))" }} />
        <div className="text-xs text-muted-foreground tracking-wider mb-1">BACKEND UNAVAILABLE</div>
        <div className="text-[11px] text-muted-foreground">Start backend at localhost:8000</div>
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

  if (!holdings.length) {
    return (
      <div className="py-16 text-center">
        <PieChart className="w-8 h-8 mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
        <div className="text-xs text-muted-foreground tracking-[0.15em] mb-4">
          NO HOLDINGS — OPTIMIZATION REQUIRES HOLDINGS
        </div>
        <button className="btn-terminal" onClick={onNavigateToPortfolio}>
          GO TO PORTFOLIO
        </button>
      </div>
    );
  }

  const result = optimizeMutation.data;

  return (
    <div className="space-y-5 p-5">
      {/* Strategy Picker */}
      <section>
        <div className="label mb-3">SELECT STRATEGY</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sortedStrategies.map((s) => {
            const active = s.id === selectedStrategy;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStrategy(s.id)}
                className="text-left p-3 border rounded-sm transition-colors"
                style={{
                  borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
                  background: active ? "hsl(var(--primary) / 0.06)" : "transparent",
                }}
              >
                <div
                  className="text-[11px] tracking-wider font-medium mb-1"
                  style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
                >
                  {s.name.toUpperCase()}
                </div>
                <div className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">
                  {s.description}
                </div>
                <div className="text-[10px] italic" style={{ color: "hsl(var(--primary) / 0.7)" }}>
                  {s.best_for}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Config + Run */}
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="label">PARAMETERS</div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1 text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-3 h-3" />
            {showConfig ? "HIDE" : "SHOW"}
          </button>
        </div>

        {showConfig && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">LOOKBACK (DAYS)</label>
              <input
                type="number"
                className="input-terminal w-full"
                value={lookback}
                onChange={(e) => setLookback(Number(e.target.value))}
                min={60}
                max={1260}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">RISK-FREE RATE</label>
              <input
                type="number"
                className="input-terminal w-full"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(Number(e.target.value))}
                step={0.005}
                min={0}
                max={0.2}
              />
            </div>
            {activeStrategy?.supports_weight_bounds && (
              <>
                <div>
                  <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">MIN WEIGHT</label>
                  <input
                    type="number"
                    className="input-terminal w-full"
                    value={minWeight}
                    onChange={(e) => setMinWeight(Number(e.target.value))}
                    step={0.01}
                    min={0}
                    max={0.5}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">MAX WEIGHT</label>
                  <input
                    type="number"
                    className="input-terminal w-full"
                    value={maxWeight}
                    onChange={(e) => setMaxWeight(Number(e.target.value))}
                    step={0.01}
                    min={0.1}
                    max={1}
                  />
                </div>
              </>
            )}
            {selectedStrategy === "black_litterman" && (
              <div>
                <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">RISK AVERSION</label>
                <input
                  type="number"
                  className="input-terminal w-full"
                  value={riskAversion}
                  onChange={(e) => setRiskAversion(Number(e.target.value))}
                  step={0.5}
                  min={0.5}
                  max={10}
                />
              </div>
            )}
            {selectedStrategy === "hrp" && (
              <div>
                <label className="text-[10px] text-muted-foreground tracking-wider block mb-1">LINKAGE</label>
                <select
                  className="input-terminal w-full"
                  value={linkageMethod}
                  onChange={(e) => setLinkageMethod(e.target.value)}
                >
                  <option value="single">single</option>
                  <option value="complete">complete</option>
                  <option value="average">average</option>
                  <option value="ward">ward</option>
                </select>
              </div>
            )}
          </div>
        )}

        <button
          className="btn-terminal-primary flex items-center gap-2"
          onClick={runOptimization}
          disabled={optimizeMutation.isPending}
        >
          {optimizeMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> OPTIMIZING...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" /> RUN OPTIMIZATION
            </>
          )}
        </button>
      </section>

      {/* Results */}
      {result && <StrategyResultPanel result={result} />}
    </div>
  );
};

const StrategyResultPanel = ({ result }: { result: StrategyOptimizationResult }) => {
  const rows = Object.keys(result.optimal_weights)
    .map((symbol) => ({
      symbol,
      current: result.current_weights[symbol] || 0,
      optimal: result.optimal_weights[symbol] || 0,
    }))
    .sort((a, b) => b.optimal - a.optimal);

  const trades = Object.entries(result.rebalancing_trades).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1])
  );

  return (
    <div className="space-y-4">
      {/* Strategy tag */}
      <div className="flex items-center gap-2">
        <div
          className="text-[10px] tracking-wider px-2 py-1 border"
          style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
        >
          {result.strategy_name.toUpperCase()}
        </div>
        <div className="text-[10px] text-muted-foreground">{result.data_period}</div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <Metric label="Expected Return" value={`${(result.expected_return * 100).toFixed(1)}%`} />
        <Metric label="Volatility" value={`${(result.volatility * 100).toFixed(1)}%`} />
        <Metric label="Sharpe" value={result.sharpe_ratio.toFixed(2)} />
        <Metric label="Max Drawdown" value={result.max_drawdown != null ? `${(result.max_drawdown * 100).toFixed(1)}%` : "n/a"} />
        <Metric label="CVaR 95" value={result.cvar != null ? `${(result.cvar * 100).toFixed(1)}%` : "n/a"} />
      </div>

      {/* Weights table */}
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-3">OPTIMAL WEIGHTS</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <th className="text-left py-2">Symbol</th>
              <th className="text-right py-2">Current</th>
              <th className="text-right py-2">Optimal</th>
              <th className="text-right py-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.optimal - r.current;
              return (
                <tr key={r.symbol} className="border-b" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
                  <td className="py-2">{r.symbol}</td>
                  <td className="text-right py-2">{(r.current * 100).toFixed(1)}%</td>
                  <td className="text-right py-2">{(r.optimal * 100).toFixed(1)}%</td>
                  <td
                    className="text-right py-2"
                    style={{ color: delta > 0.001 ? "hsl(var(--chart-2))" : delta < -0.001 ? "hsl(var(--destructive))" : "inherit" }}
                  >
                    {delta > 0 ? "+" : ""}
                    {(delta * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rebalancing trades */}
      {trades.length > 0 && (
        <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
          <div className="label mb-3">REBALANCING TRADES</div>
          <div className="space-y-1">
            {trades.map(([symbol, amount]) => (
              <div key={symbol} className="flex justify-between text-xs py-1 border-b" style={{ borderColor: "hsl(var(--border) / 0.3)" }}>
                <span>{symbol}</span>
                <span style={{ color: amount > 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))" }}>
                  {amount > 0 ? "BUY" : "SELL"} ${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="border p-2" style={{ borderColor: "hsl(var(--border))" }}>
    <div className="label mb-1">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);
