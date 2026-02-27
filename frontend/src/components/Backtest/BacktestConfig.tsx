import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, X, Check, Loader2 } from "lucide-react";
import {
  backtestAPI,
  portfolioAPI,
  type StrategyInfo,
  type BacktestResult,
  type BacktestSSEEvent,
} from "@/lib/api";

interface BacktestConfigProps {
  onComplete: (results: BacktestResult[]) => void;
}

const REBALANCE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-Annual" },
  { value: "annual", label: "Annual" },
  { value: "buy_and_hold", label: "Buy & Hold" },
];

const BENCHMARKS = ["SPY", "QQQ", "IWM", "DIA"];

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export const BacktestConfig = ({ onComplete }: BacktestConfigProps) => {
  // Strategies
  const { data: strategies = [] } = useQuery({
    queryKey: ["strategies"],
    queryFn: backtestAPI.getStrategies,
  });

  // Portfolio holdings for auto-populate
  const { data: holdings = [] } = useQuery({
    queryKey: ["holdings-with-metrics"],
    queryFn: portfolioAPI.getHoldingsWithMetrics,
  });

  const portfolioSymbols = holdings.map((h) => h.symbol);

  // Form state
  const [usePortfolio, setUsePortfolio] = useState(true);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolInput, setSymbolInput] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState("mean_variance");
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(["mean_variance"]);
  const [startDate, setStartDate] = useState(fmtDate(new Date(Date.now() - 2 * 365 * 86400000)));
  const [endDate, setEndDate] = useState(fmtDate(new Date()));
  const [capital, setCapital] = useState("100000");
  const [rebalFreq, setRebalFreq] = useState("quarterly");
  const [lookback, setLookback] = useState("180");
  const [benchmark, setBenchmark] = useState("SPY");
  const [txCost, setTxCost] = useState("10");

  // Running state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (usePortfolio && portfolioSymbols.length > 0) {
      setSymbols(portfolioSymbols);
    }
  }, [usePortfolio, holdings]);

  const addSymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (s && !symbols.includes(s)) {
      setSymbols([...symbols, s]);
    }
    setSymbolInput("");
  };

  const removeSymbol = (s: string) => {
    setSymbols(symbols.filter((x) => x !== s));
  };

  const toggleStrategy = (id: string) => {
    setSelectedStrategies((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRun = async () => {
    const syms = usePortfolio ? portfolioSymbols : symbols;
    if (syms.length < 2) {
      setError("Need at least 2 symbols. Add holdings in the Portfolio tab or enter symbols manually.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start date and end date are required.");
      return;
    }
    if (startDate >= endDate) {
      setError("Start date must be before end date.");
      return;
    }

    setRunning(true);
    setProgress("Starting...");
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    const results: BacktestResult[] = [];

    const onEvent = (event: BacktestSSEEvent) => {
      switch (event.type) {
        case "status":
          setProgress(event.message);
          break;
        case "result":
          results.push(event.data);
          break;
        case "compare_result":
          results.push(...event.results);
          break;
        case "error":
          setError(event.message);
          break;
        case "done":
          break;
      }
    };

    try {
      if (compareMode && selectedStrategies.length > 1) {
        await backtestAPI.compareStrategies(
          {
            symbols: syms,
            strategies: selectedStrategies,
            start_date: startDate,
            end_date: endDate,
            initial_capital: parseFloat(capital) || 100000,
            rebalance_frequency: rebalFreq,
            lookback_days: parseInt(lookback) || 180,
            benchmark,
            transaction_cost_bps: parseFloat(txCost) || 10,
          },
          onEvent,
          controller.signal
        );
      } else {
        await backtestAPI.runBacktest(
          {
            symbols: syms,
            strategy: selectedStrategy,
            start_date: startDate,
            end_date: endDate,
            initial_capital: parseFloat(capital) || 100000,
            rebalance_frequency: rebalFreq,
            lookback_days: parseInt(lookback) || 180,
            benchmark,
            transaction_cost_bps: parseFloat(txCost) || 10,
          },
          onEvent,
          controller.signal
        );
      }

      if (results.length > 0) {
        onComplete(results);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(err?.message || "Backtest failed");
      }
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setRunning(false);
    setProgress("");
  };

  const activeSymbols = usePortfolio ? portfolioSymbols : symbols;

  return (
    <div>
      {/* ── Symbol Selection ─────────────────────────────────────── */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="label">SYMBOLS</span>
          <button
            className={`text-[10px] tracking-[0.12em] px-2 py-0.5 transition-colors ${
              usePortfolio ? "text-foreground" : "text-muted-foreground"
            }`}
            style={{
              border: `1px solid ${usePortfolio ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
              background: usePortfolio ? "hsl(var(--primary) / 0.1)" : "transparent",
            }}
            onClick={() => setUsePortfolio(!usePortfolio)}
          >
            {usePortfolio ? "USING PORTFOLIO" : "USE MY PORTFOLIO"}
          </button>
        </div>

        {!usePortfolio && (
          <div className="flex items-center gap-2 mb-2">
            <input
              className="input-terminal"
              style={{ width: "100px" }}
              placeholder="AAPL"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            />
            <button className="btn-terminal" onClick={addSymbol}>
              ADD
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {activeSymbols.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wider"
              style={{
                background: "hsl(var(--primary) / 0.1)",
                color: "hsl(var(--primary))",
                border: "1px solid hsl(var(--primary) / 0.3)",
              }}
            >
              {s}
              {!usePortfolio && (
                <X
                  className="w-2.5 h-2.5 cursor-pointer opacity-60 hover:opacity-100"
                  onClick={() => removeSymbol(s)}
                />
              )}
            </span>
          ))}
          {activeSymbols.length === 0 && (
            <span className="text-[10px] text-muted-foreground tracking-wider">
              {usePortfolio ? "NO HOLDINGS — ADD IN PORTFOLIO TAB" : "ADD SYMBOLS ABOVE"}
            </span>
          )}
        </div>
      </div>

      {/* ── Strategy Selection ───────────────────────────────────── */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="label">STRATEGY</span>
          <button
            className={`text-[10px] tracking-[0.12em] px-2 py-0.5 transition-colors ${
              compareMode ? "text-foreground" : "text-muted-foreground"
            }`}
            style={{
              border: `1px solid ${compareMode ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
              background: compareMode ? "hsl(var(--primary) / 0.1)" : "transparent",
            }}
            onClick={() => setCompareMode(!compareMode)}
          >
            {compareMode ? "COMPARE MODE" : "SINGLE MODE"}
          </button>
        </div>

        <div className="space-y-1.5">
          {strategies.map((s) => {
            const isSelected = compareMode
              ? selectedStrategies.includes(s.id)
              : selectedStrategy === s.id;

            return (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 transition-colors"
                style={{
                  border: `1px solid ${isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                  background: isSelected ? "hsl(var(--primary) / 0.06)" : "transparent",
                }}
                onClick={() => {
                  if (compareMode) {
                    toggleStrategy(s.id);
                  } else {
                    setSelectedStrategy(s.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 flex items-center justify-center flex-shrink-0"
                    style={{
                      border: `1px solid ${isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                      background: isSelected ? "hsl(var(--primary))" : "transparent",
                    }}
                  >
                    {isSelected && <Check className="w-2 h-2 text-background" />}
                  </div>
                  <div>
                    <div className="text-[11px] tracking-wider text-foreground">
                      {s.name.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {s.description}
                    </div>
                    <div
                      className="text-[9px] mt-0.5 tracking-wider"
                      style={{ color: "hsl(var(--primary) / 0.7)" }}
                    >
                      {s.best_for}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Parameters ────────────────────────────────────────────── */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <span className="label mb-3 block">PARAMETERS</span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-1">
            <div className="label">Start Date</div>
            <input
              type="date"
              className="input-terminal w-full"
              value={startDate}
              min={fmtDate(new Date(Date.now() - 5 * 365 * 86400000))}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="label">End Date</div>
            <input
              type="date"
              className="input-terminal w-full"
              value={endDate}
              min={startDate}
              max={fmtDate(new Date())}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="label">Initial Capital ($)</div>
            <input
              type="number"
              className="input-terminal w-full"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="label">Rebalance Frequency</div>
            <select
              className="input-terminal w-full"
              value={rebalFreq}
              onChange={(e) => setRebalFreq(e.target.value)}
            >
              {REBALANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="label">Lookback Window (days)</div>
            <input
              type="number"
              className="input-terminal w-full"
              value={lookback}
              min={60}
              max={365}
              onChange={(e) => setLookback(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="label">Transaction Cost (bps)</div>
            <input
              type="number"
              className="input-terminal w-full"
              value={txCost}
              min={0}
              max={100}
              onChange={(e) => setTxCost(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="label">Benchmark</div>
            <select
              className="input-terminal w-full"
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
            >
              {BENCHMARKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Run Button ────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {error && (
          <div
            className="text-[10px] tracking-wider mb-3 px-3 py-2"
            style={{
              color: "hsl(var(--destructive))",
              border: "1px solid hsl(var(--destructive) / 0.3)",
              background: "hsl(var(--destructive) / 0.06)",
            }}
          >
            {error}
          </div>
        )}

        {running ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2
                className="w-4 h-4 animate-spin"
                style={{ color: "hsl(var(--primary))" }}
              />
              <span className="text-[10px] tracking-wider text-muted-foreground">
                {progress || "RUNNING..."}
              </span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill animate-pulse"
                style={{ width: "60%" }}
              />
            </div>
            <button className="btn-terminal" onClick={handleCancel}>
              CANCEL
            </button>
          </div>
        ) : (
          <button
            className="btn-terminal-primary flex items-center gap-2 w-full justify-center py-2.5"
            onClick={handleRun}
            disabled={activeSymbols.length < 2}
          >
            <Play className="w-3.5 h-3.5" />
            {compareMode ? "COMPARE STRATEGIES" : "RUN BACKTEST"}
          </button>
        )}
      </div>
    </div>
  );
};
