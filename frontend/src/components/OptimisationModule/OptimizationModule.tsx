import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  optimizationAPI,
  portfolioAPI,
  type AdditionCandidate,
  type AnalyzeRequest,
  type HighCorrelationPair,
  type HoldingWithMetrics,
  type OptimizationResult,
  type PortfolioAnalysis,
  type RemovalCandidate,
  type RiskContribution,
  type SectorGap,
} from "@/lib/api";

interface Props {
  onNavigateToPortfolio?: () => void;
}

const riskProfiles = ["conservative", "moderate", "aggressive"] as const;

export const OptimizationModule = ({ onNavigateToPortfolio }: Props) => {
  const { toast } = useToast();
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("moderate");

  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } =
    useQuery<HoldingWithMetrics[]>({
      queryKey: ["holdings-with-metrics"],
      queryFn: portfolioAPI.getHoldingsWithMetrics,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  const analyzeMutation = useMutation({
    mutationFn: (req: AnalyzeRequest) => optimizationAPI.analyzePortfolio(req),
    onError: (e: any) => {
      toast({
        title: "Analysis failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const runAnalysis = () => {
    if (!holdings.length) return;
    const current_prices: Record<string, number> = {};
    for (const h of holdings) current_prices[h.symbol] = h.current_price;

    analyzeMutation.mutate({
      risk_profile: riskProfile,
      current_prices,
      lookback_period: 365,
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
          NO HOLDINGS — ANALYSIS REQUIRES HOLDINGS
        </div>
        <button className="btn-terminal" onClick={onNavigateToPortfolio}>
          GO TO PORTFOLIO
        </button>
      </div>
    );
  }

  const analysis = analyzeMutation.data;

  return (
    <div className="space-y-6 p-5">
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-3">Control Strip</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {riskProfiles.map((p) => (
            <button
              key={p}
              onClick={() => setRiskProfile(p)}
              className="px-3 py-2 text-[11px] tracking-wider border"
              style={{
                borderColor: riskProfile === p ? "hsl(var(--primary))" : "hsl(var(--border))",
                background: riskProfile === p ? "hsl(var(--primary) / 0.08)" : "transparent",
              }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="btn-terminal-primary" onClick={runAnalysis} disabled={analyzeMutation.isPending}>
          {analyzeMutation.isPending ? "ANALYSING..." : "ANALYSE PORTFOLIO"}
        </button>
      </section>

      {analysis && <Dashboard analysis={analysis} />}
    </div>
  );
};

const Dashboard = ({ analysis }: { analysis: PortfolioAnalysis }) => {
  return (
    <div className="space-y-6">
      <HealthScorePanel analysis={analysis} />
      <SectorGapChart gaps={analysis.sector_summary.gaps} />
      <CorrelationHeatmap
        matrix={analysis.correlation_matrix}
        pairs={analysis.high_correlation_pairs}
      />
      <RiskContributionTable data={analysis.risk_contributions} />
      <section className="grid md:grid-cols-2 gap-4">
        <RemovalCandidates data={analysis.removal_candidates} />
        <AdditionSuggestions data={analysis.addition_candidates} />
      </section>
      <OptimizationResultPanel result={analysis.optimized_result} />
    </div>
  );
};

const HealthScorePanel = ({ analysis }: { analysis: PortfolioAnalysis }) => {
  const gradeColor =
    analysis.health_grade.startsWith("A")
      ? "hsl(var(--chart-2))"
      : analysis.health_grade.startsWith("B")
      ? "#84cc16"
      : analysis.health_grade.startsWith("C")
      ? "#f59e0b"
      : "hsl(var(--destructive))";

  const bars = [
    { label: "Diversification", value: analysis.health_sub_scores.diversification },
    { label: "Correlation", value: analysis.health_sub_scores.correlation },
    { label: "Concentration", value: analysis.health_sub_scores.concentration },
    { label: "Quality", value: analysis.health_sub_scores.quality },
  ];

  return (
    <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="label mb-2">Health Score</div>
          <div className="text-4xl font-semibold">{analysis.health_score}</div>
        </div>
        <div className="px-3 py-1 border text-sm" style={{ borderColor: gradeColor, color: gradeColor }}>
          {analysis.health_grade}
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {bars.map((bar) => (
          <div key={bar.label} className="text-xs">
            <div className="flex justify-between mb-1">
              <span>{bar.label}</span>
              <span>{bar.value.toFixed(1)}</span>
            </div>
            <div className="h-2 w-full bg-muted">
              <div className="h-2" style={{ width: `${Math.max(0, Math.min(100, bar.value))}%`, background: "hsl(var(--primary))" }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground italic">{analysis.diagnosis}</p>
    </section>
  );
};

const SectorGapChart = ({ gaps }: { gaps: SectorGap[] }) => {
  return (
    <section className="p-4 border rounded-sm overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Sector Gaps vs Benchmark</div>
      <div className="space-y-2 min-w-[680px]">
        {gaps.map((g) => {
          const cur = g.current_weight * 100;
          const bench = g.benchmark_weight * 100;
          const gap = g.gap * 100;
          const color = gap > 5 ? "hsl(var(--destructive))" : gap < -5 ? "hsl(var(--chart-2))" : "hsl(var(--primary))";
          return (
            <div key={g.sector} className="grid grid-cols-[170px_1fr_80px] items-center gap-3 text-xs">
              <div>{g.sector}</div>
              <div>
                <div className="h-2 bg-muted mb-1 relative">
                  <div className="h-2" style={{ width: `${Math.min(100, Math.max(0, cur))}%`, background: color }} />
                </div>
                <div className="h-2 bg-muted relative">
                  <div className="h-2" style={{ width: `${Math.min(100, Math.max(0, bench))}%`, background: "hsl(var(--muted-foreground))" }} />
                </div>
              </div>
              <div style={{ color }}>{gap.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const CorrelationHeatmap = ({
  matrix,
  pairs,
}: {
  matrix: Record<string, Record<string, number>>;
  pairs: HighCorrelationPair[];
}) => {
  const symbols = Object.keys(matrix);
  const cell = Math.max(18, Math.min(40, Math.floor(620 / Math.max(1, symbols.length))));
  const width = symbols.length * cell;
  const highKey = new Set(pairs.map((p) => `${p.stock_a}:${p.stock_b}`));

  const colorFor = (r: number) => {
    if (r < 0) {
      const t = Math.min(1, Math.abs(r));
      return `rgb(${Math.round(25 * (1 - t))}, ${Math.round(120 + 80 * t)}, ${Math.round(40 * (1 - t))})`;
    }
    const t = Math.min(1, r);
    return `rgb(${Math.round(40 + 140 * t)}, ${Math.round(35 * (1 - t))}, ${Math.round(35 * (1 - t))})`;
  };

  return (
    <section className="p-4 border rounded-sm overflow-auto" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Correlation Heatmap</div>
      {!!symbols.length && (
        <svg width={width + 120} height={width + 120}>
          {symbols.map((row, i) =>
            symbols.map((col, j) => {
              const r = matrix[row]?.[col] ?? 0;
              const keyA = `${row}:${col}`;
              const keyB = `${col}:${row}`;
              const highlighted = Math.abs(r) > 0.7 || highKey.has(keyA) || highKey.has(keyB);
              return (
                <g key={`${row}-${col}`}>
                  <rect
                    x={80 + j * cell}
                    y={30 + i * cell}
                    width={cell - 1}
                    height={cell - 1}
                    fill={colorFor(r)}
                    stroke={highlighted ? "#facc15" : "none"}
                  />
                  {cell >= 32 && (
                    <text x={80 + j * cell + 4} y={30 + i * cell + 12} fill="#f4f4f5" fontSize={10}>
                      {r.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })
          )}
          {symbols.map((s, i) => (
            <text key={`x-${s}`} x={80 + i * cell + 2} y={20} fontSize={10} fill="currentColor">
              {s}
            </text>
          ))}
          {symbols.map((s, i) => (
            <text key={`y-${s}`} x={8} y={30 + i * cell + 12} fontSize={10} fill="currentColor">
              {s}
            </text>
          ))}
        </svg>
      )}
      <div className="mt-3 text-xs text-muted-foreground">
        {pairs.slice(0, 8).map((p) => `${p.stock_a}/${p.stock_b}: ${p.correlation.toFixed(2)}`).join(" • ") ||
          "No elevated correlation pairs"}
      </div>
    </section>
  );
};

const RiskContributionTable = ({ data }: { data: RiskContribution[] }) => {
  return (
    <section className="p-4 border rounded-sm overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Risk Contribution</div>
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <th className="text-left py-2">Symbol</th>
            <th className="text-right py-2">Weight</th>
            <th className="text-right py-2">Variance Contrib</th>
            <th className="text-right py-2">Marginal Sharpe</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.symbol} className="border-b" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
              <td className="py-2">{r.symbol}</td>
              <td className="text-right py-2">{(r.weight * 100).toFixed(1)}%</td>
              <td className="text-right py-2">{(r.variance_contribution * 100).toFixed(2)}%</td>
              <td className="text-right py-2" style={{ color: r.marginal_sharpe_impact > 0 ? "hsl(var(--destructive))" : "hsl(var(--foreground))" }}>
                {r.marginal_sharpe_impact.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const RemovalCandidates = ({ data }: { data: RemovalCandidate[] }) => {
  return (
    <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Removal Candidates</div>
      <div className="space-y-3">
        {data.length === 0 && <div className="text-xs text-muted-foreground">No strong removal signals.</div>}
        {data.map((c) => (
          <div key={c.symbol} className="p-3 border" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">{c.symbol}</div>
              <div className="text-xs px-2 py-0.5 border" style={{ borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" }}>
                {c.removal_score.toFixed(0)}
              </div>
            </div>
            <div className="text-xs mb-1">{c.reasons.join(" • ")}</div>
            <div className="text-xs italic text-muted-foreground">{c.explanation}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const AdditionSuggestions = ({ data }: { data: AdditionCandidate[] }) => {
  return (
    <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Addition Suggestions</div>
      <div className="space-y-3">
        {data.length === 0 && <div className="text-xs text-muted-foreground">No additions suggested.</div>}
        {data.map((c) => (
          <div key={c.symbol} className="p-3 border" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">
                {c.symbol} <span className="text-muted-foreground">{c.name}</span>
              </div>
              <div className="text-[10px] px-2 py-0.5 border" style={{ borderColor: "hsl(var(--primary))" }}>
                {c.sector}
              </div>
            </div>
            <div className="text-xs mb-1">
              mom: {(Number(c.metrics?.momentum_6m || 0) * 100).toFixed(1)}% • pe: {c.metrics?.trailing_pe ?? "n/a"} • mcap: {c.metrics?.market_cap ?? "n/a"}
            </div>
            <div className="text-xs italic text-muted-foreground">{c.explanation}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const OptimizationResultPanel = ({ result }: { result?: OptimizationResult }) => {
  if (!result) {
    return (
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-2">Optimized Portfolio</div>
        <div className="text-xs text-muted-foreground">Optimization unavailable for this run.</div>
      </section>
    );
  }

  const rows = Object.keys(result.optimal_weights)
    .map((symbol) => ({ symbol, current: result.current_weights[symbol] || 0, optimal: result.optimal_weights[symbol] || 0 }))
    .sort((a, b) => b.optimal - a.optimal);

  return (
    <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Optimized Portfolio</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
        <Metric label="Expected Return" value={`${(result.expected_return * 100).toFixed(1)}%`} />
        <Metric label="Volatility" value={`${(result.volatility * 100).toFixed(1)}%`} />
        <Metric label="Sharpe" value={result.sharpe_ratio.toFixed(2)} />
        <Metric label="CVaR" value={result.cvar ? `${(result.cvar * 100).toFixed(1)}%` : "n/a"} />
      </div>
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
                <td className="text-right py-2" style={{ color: delta > 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))" }}>
                  {(delta * 100).toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="border p-2" style={{ borderColor: "hsl(var(--border))" }}>
    <div className="label mb-1">{label}</div>
    <div className="text-sm font-medium">{value}</div>
  </div>
);
