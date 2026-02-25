import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  RefreshCw,
  X,
} from "lucide-react";
import { sentimentAPI, type SentimentData, type CorrelationData } from "@/lib/api";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

type ActiveTab = "overview" | "correlation" | "heatmap";

const sentimentLabel = (s: number) =>
  s >= 0.7 ? "POSITIVE" : s >= 0.5 ? "NEUTRAL" : "NEGATIVE";

const sentimentColor = (s: number) =>
  s >= 0.7
    ? "hsl(var(--primary))"
    : s >= 0.5
    ? "hsl(var(--warning))"
    : "hsl(var(--destructive))";

export const SentimentDashboard = () => {
  const [ticker, setTicker] = useState("");
  const [loaded, setLoaded] = useState<SentimentData[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationData[]>([]);
  const [selectedCorr, setSelectedCorr] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = ticker.trim().length > 0 && ticker.trim().length <= 10;
  const hasData = loaded.length > 0;

  const handleLoad = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await sentimentAPI.getSentiment(ticker.trim().toUpperCase());
      setLoaded((prev) => {
        const idx = prev.findIndex((d) => d.symbol === data.symbol);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = data;
          return copy;
        }
        return [...prev, data];
      });
      setTicker("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load sentiment";
      if (msg.includes("404"))
        setError(`Ticker "${ticker}" not found.`);
      else if (msg.includes("429"))
        setError("Rate limit exceeded. Try again shortly.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!hasData) return;
    setLoading(true);
    try {
      await sentimentAPI.refreshCache();
      const refreshed: SentimentData[] = [];
      for (const d of loaded) {
        try {
          refreshed.push(await sentimentAPI.getSentiment(d.symbol));
        } catch {
          refreshed.push(d);
        }
      }
      setLoaded(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCorrelation = async (symbol: string) => {
    setSelectedCorr(symbol);
    try {
      const corr = await sentimentAPI.getCorrelation(symbol);
      setCorrelations((prev) => {
        const idx = prev.findIndex((c) => c.symbol === symbol);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = corr;
          return copy;
        }
        return [...prev, corr];
      });
    } catch {
      // keep existing if refresh fails
    }
  };

  useEffect(() => {
    if (hasData) {
      loaded.forEach((d) => handleLoadCorrelation(d.symbol));
    }
  }, [loaded, hasData]);

  const clearAll = () => {
    setLoaded([]);
    setCorrelations([]);
    setSelectedCorr("");
    setError(null);
    setTicker("");
    setActiveTab("overview");
  };

  return (
    <div>
      {/* ── Controls ──────────────────────────────────────────────── */}
      <div
        className="px-5 py-3 flex items-end gap-3 flex-wrap"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <div className="space-y-1">
          <div className="label">Ticker Symbol</div>
          <input
            className="input-terminal"
            style={{ width: "130px" }}
            placeholder="AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          />
        </div>

        <button
          className="btn-terminal-primary flex items-center gap-1.5"
          onClick={handleLoad}
          disabled={loading || !isValid}
        >
          <Activity className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "LOADING..." : "LOAD"}
        </button>

        {hasData && (
          <>
            <button
              className="btn-terminal flex items-center gap-1.5"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              REFRESH ALL
            </button>
            <button
              className="btn-terminal-ghost flex items-center gap-1.5"
              onClick={clearAll}
            >
              <X className="w-3 h-3" />
              CLEAR ALL
            </button>
            <span className="text-[10px] text-muted-foreground tracking-wider ml-auto">
              {loaded.length} STOCK{loaded.length !== 1 ? "S" : ""} LOADED
            </span>
          </>
        )}
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 px-5 py-2 text-xs"
          style={{
            borderBottom: "1px solid hsl(var(--border))",
            color: "hsl(var(--destructive))",
            background: "hsl(var(--destructive) / 0.06)",
          }}
        >
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {error}
          <button
            className="ml-auto btn-terminal-ghost"
            onClick={() => setError(null)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {!hasData && !loading && (
        <div className="px-5 py-16 text-center">
          <Activity
            className="w-8 h-8 mx-auto mb-3"
            style={{ color: "hsl(var(--muted-foreground))" }}
          />
          <div className="text-xs text-muted-foreground tracking-[0.15em]">
            ENTER A TICKER TO LOAD SENTIMENT DATA
          </div>
        </div>
      )}

      {/* ── Tabs (when data loaded) ───────────────────────────────── */}
      {hasData && (
        <>
          <div
            className="flex items-center gap-0"
            style={{ borderBottom: "1px solid hsl(var(--border))" }}
          >
            {(["overview", "correlation", "heatmap"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                className="text-[10px] tracking-[0.15em] px-4 py-2.5 transition-colors"
                style={{
                  color:
                    activeTab === tab
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))",
                  borderBottom:
                    activeTab === tab
                      ? "1px solid hsl(var(--primary))"
                      : "1px solid transparent",
                  marginBottom: "-1px",
                }}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "overview"
                  ? "OVERVIEW"
                  : tab === "correlation"
                  ? "PRICE CORRELATION"
                  : "HEATMAP"}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="p-5">
              <div
                className="grid gap-0"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                {loaded.map((stock) => {
                  const isPos = (stock.price_change ?? 0) >= 0;
                  return (
                    <div
                      key={stock.symbol}
                      className="p-4"
                      style={{ borderRight: "1px solid hsl(var(--border))", borderBottom: "1px solid hsl(var(--border))" }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className="text-sm font-bold"
                          style={{ color: "hsl(var(--primary))" }}
                        >
                          {stock.symbol}
                        </span>
                        <span
                          className="text-[10px] tracking-[0.12em] font-medium px-1.5 py-0.5"
                          style={{
                            color: sentimentColor(stock.overall_sentiment),
                            border: `1px solid ${sentimentColor(stock.overall_sentiment)}`,
                          }}
                        >
                          {sentimentLabel(stock.overall_sentiment)}
                        </span>
                      </div>

                      {/* Price row */}
                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <div className="text-base font-semibold">
                            ${(stock.price ?? 0).toFixed(2)}
                          </div>
                          <div
                            className="flex items-center gap-1 text-xs"
                            style={{
                              color: `hsl(var(--${isPos ? "primary" : "destructive"}))`,
                            }}
                          >
                            {isPos ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {isPos ? "+" : ""}
                            {(stock.price_change ?? 0).toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-xl font-bold"
                            style={{ color: sentimentColor(stock.overall_sentiment) }}
                          >
                            {(stock.overall_sentiment * 100).toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground tracking-wider">
                            SENTIMENT
                          </div>
                        </div>
                      </div>

                      {/* Sentiment bar */}
                      <div className="bar-track mb-3">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${stock.overall_sentiment * 100}%`,
                            background: sentimentColor(stock.overall_sentiment),
                          }}
                        />
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-0">
                        {[
                          ["MENTIONS", stock.total_mentions.toLocaleString()],
                          ["NEWS", stock.sources.news.toString()],
                          ["REDDIT", stock.sources.reddit.toString()],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <div className="text-[10px] text-muted-foreground tracking-wider">
                              {label}
                            </div>
                            <div className="text-xs font-medium">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Correlation tab */}
          {activeTab === "correlation" && (
            <div className="p-5">
              {/* Stock selector */}
              <div className="flex items-center gap-1 mb-4">
                {loaded.map((stock) => (
                  <button
                    key={stock.symbol}
                    className="text-[10px] tracking-[0.12em] px-3 py-1.5 transition-colors"
                    style={{
                      border: "1px solid",
                      borderColor:
                        selectedCorr === stock.symbol
                          ? "hsl(var(--primary))"
                          : "hsl(var(--border))",
                      color:
                        selectedCorr === stock.symbol
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))",
                    }}
                    onClick={() => handleLoadCorrelation(stock.symbol)}
                  >
                    {stock.symbol}
                  </button>
                ))}
              </div>

              {selectedCorr ? (
                (() => {
                  const stock = loaded.find((d) => d.symbol === selectedCorr);
                  if (!stock) return null;

                  // Build 24h mock data (same as original)
                  const basePrice = stock.price ?? 100;
                  const baseSentiment = stock.overall_sentiment * 100;
                  const chartData = Array.from({ length: 24 }, (_, i) => {
                    const t = new Date();
                    t.setHours(t.getHours() - (23 - i));
                    const priceVar = (Math.random() - 0.5) * basePrice * 0.02;
                    const price = Math.max(0, basePrice + priceVar);
                    const corrFactor = Math.random() > 0.3 ? 1 : -1;
                    const sentVar =
                      (priceVar / basePrice) * 100 * corrFactor +
                      (Math.random() - 0.5) * 10;
                    const sentiment = Math.max(
                      0,
                      Math.min(100, baseSentiment + sentVar)
                    );
                    return {
                      time: t.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                      price: parseFloat(price.toFixed(2)),
                      sentiment: parseFloat(sentiment.toFixed(1)),
                    };
                  });

                  return (
                    <div>
                      {/* Metrics */}
                      <div
                        className="grid grid-cols-4 mb-4"
                        style={{ border: "1px solid hsl(var(--border))" }}
                      >
                        {[
                          ["Current Price", `$${(stock.price ?? 0).toFixed(2)}`, "foreground"],
                          [
                            "Sentiment",
                            `${(stock.overall_sentiment * 100).toFixed(0)}%`,
                            stock.overall_sentiment >= 0.7
                              ? "primary"
                              : stock.overall_sentiment >= 0.5
                              ? "warning"
                              : "destructive",
                          ],
                          [
                            "Price Change",
                            `${(stock.price_change ?? 0) >= 0 ? "+" : ""}${(stock.price_change ?? 0).toFixed(2)}%`,
                            (stock.price_change ?? 0) >= 0 ? "primary" : "destructive",
                          ],
                          ["Mentions", stock.total_mentions.toLocaleString(), "foreground"],
                        ].map(([label, val, color]) => (
                          <div
                            key={label}
                            className="p-3"
                            style={{ borderRight: "1px solid hsl(var(--border))" }}
                          >
                            <div className="label mb-1">{label}</div>
                            <div
                              className="text-base font-semibold"
                              style={{
                                color: `hsl(var(--${color}))`,
                              }}
                            >
                              {val}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Chart */}
                      <div
                        className="p-4"
                        style={{ border: "1px solid hsl(var(--border))" }}
                      >
                        <div className="label mb-3">
                          PRICE VS SENTIMENT — {selectedCorr} (24H)
                        </div>
                        <ChartContainer
                          config={{
                            price: { label: "Price ($)", color: "hsl(var(--chart-2))" },
                            sentiment: { label: "Sentiment (%)", color: "hsl(var(--primary))" },
                          }}
                          className="h-[320px] w-full"
                        >
                          <LineChart
                            data={chartData}
                            margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
                          >
                            <CartesianGrid
                              strokeDasharray="2 2"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="time"
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              hide
                            />
                            <YAxis
                              yAxisId="price"
                              orientation="left"
                              domain={["dataMin - 2", "dataMax + 2"]}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={(v) => `$${v}`}
                            />
                            <YAxis
                              yAxisId="sentiment"
                              orientation="right"
                              domain={[0, 100]}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <ChartTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div
                                    className="px-3 py-2 text-xs"
                                    style={{
                                      background: "hsl(var(--card))",
                                      border: "1px solid hsl(var(--border))",
                                    }}
                                  >
                                    <div className="text-muted-foreground mb-1">
                                      {payload[0]?.payload?.time}
                                    </div>
                                    <div style={{ color: "hsl(var(--chart-2))" }}>
                                      Price: ${payload[0]?.value}
                                    </div>
                                    <div style={{ color: "hsl(var(--primary))" }}>
                                      Sentiment: {payload[1]?.value}%
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              yAxisId="price"
                              type="monotone"
                              dataKey="price"
                              stroke="hsl(var(--chart-2))"
                              strokeWidth={1.5}
                              dot={false}
                            />
                            <Line
                              yAxisId="sentiment"
                              type="monotone"
                              dataKey="sentiment"
                              stroke="hsl(var(--primary))"
                              strokeWidth={1.5}
                              strokeDasharray="4 2"
                              dot={false}
                            />
                          </LineChart>
                        </ChartContainer>
                        <div className="flex items-center gap-6 mt-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-px"
                              style={{ background: "hsl(var(--chart-2))" }}
                            />
                            <span className="text-[10px] text-muted-foreground">Price</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-px"
                              style={{
                                background: "hsl(var(--primary))",
                                borderTop: "1px dashed hsl(var(--primary))",
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground">
                              Sentiment
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground tracking-wider">
                  SELECT A STOCK ABOVE TO VIEW CORRELATION
                </div>
              )}
            </div>
          )}

          {/* Heatmap tab */}
          {activeTab === "heatmap" && (
            <div className="p-5">
              <div
                className="grid mb-4"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "1px",
                  background: "hsl(var(--border))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                {loaded.map((stock) => {
                  const intensity = stock.overall_sentiment;
                  const color = sentimentColor(intensity);
                  const opacity = 0.15 + Math.abs(intensity - 0.5) * 2 * 0.65;
                  return (
                    <div
                      key={stock.symbol}
                      className="p-4 cursor-pointer transition-opacity hover:opacity-100 flex flex-col items-center justify-center"
                      style={{
                        background: `hsl(var(--background))`,
                        borderLeft: `3px solid ${color}`,
                        opacity,
                      }}
                      onClick={() => setSelectedCorr(stock.symbol)}
                    >
                      <div
                        className="text-sm font-bold mb-1"
                        style={{ color }}
                      >
                        {stock.symbol}
                      </div>
                      <div className="text-lg font-semibold" style={{ color }}>
                        {(intensity * 100).toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 tracking-wider">
                        {sentimentLabel(intensity)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-6 text-[10px] text-muted-foreground tracking-wider">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3"
                    style={{ background: "hsl(var(--destructive))" }}
                  />
                  NEGATIVE
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3"
                    style={{ background: "hsl(var(--warning))" }}
                  />
                  NEUTRAL
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3"
                    style={{ background: "hsl(var(--primary))" }}
                  />
                  POSITIVE
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
