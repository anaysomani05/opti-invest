const API_BASE = "http://localhost:8000";

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Holding {
  id: string;
  symbol: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  current_price?: number;
}

export interface HoldingCreate {
  symbol: string;
  quantity: number;
  buy_price: number;
  buy_date?: string;
}

export interface HoldingWithMetrics {
  id: string;
  symbol: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  current_price: number;
  value: number;
  gain_loss: number;
  gain_loss_percent: number;
}

export interface PortfolioSummary {
  total_value: number;
  total_gain_loss: number;
  total_gain_loss_percent: number;
  holdings_count: number;
}

export interface PortfolioOverview {
  summary: PortfolioSummary;
  holdings: Holding[];
  sector_allocation: Record<string, number>;
}

export interface CSVUploadResponse {
  success: boolean;
  message: string;
  added: number;
  errors: string[];
}

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
}

// ─── Backtest Types ──────────────────────────────────────────────────────────

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  best_for: string;
  uses_expected_returns: boolean;
  supports_weight_bounds: boolean;
}

export interface BacktestConfig {
  symbols: string[];
  strategy: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  rebalance_frequency: string;
  lookback_days: number;
  benchmark: string;
  transaction_cost_bps: number;
}

export interface EquityCurvePoint {
  date: string;
  portfolio_value: number;
  benchmark_value: number;
}

export interface WeightSnapshot {
  date: string;
  weights: Record<string, number>;
}

export interface BacktestTrade {
  date: string;
  symbol: string;
  action: string;
  shares: number;
  amount: number;
  cost: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  ret: number;
}

export interface BacktestMetrics {
  total_return: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  max_drawdown_duration_days: number;
  calmar_ratio: number;
  cvar_95: number;
  win_rate_monthly: number;
  best_month: number;
  worst_month: number;
  total_transaction_costs: number;
}

export interface BacktestResult {
  strategy: string;
  strategy_name: string;
  config: BacktestConfig;
  equity_curve: EquityCurvePoint[];
  weights_over_time: WeightSnapshot[];
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  benchmark_metrics: BacktestMetrics;
  monthly_returns: MonthlyReturn[];
}

export interface BacktestCompareRequest {
  symbols: string[];
  strategies: string[];
  start_date: string;
  end_date: string;
  initial_capital: number;
  rebalance_frequency: string;
  lookback_days: number;
  benchmark: string;
  transaction_cost_bps: number;
}

export type BacktestSSEEvent =
  | { type: "status"; message: string }
  | { type: "result"; data: BacktestResult }
  | { type: "compare_result"; results: BacktestResult[] }
  | { type: "error"; message: string }
  | { type: "done" };

// ─── SSE Parser Helper ──────────────────────────────────────────────────────

async function parseSSEStream(
  response: Response,
  onEvent: (event: BacktestSSEEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.trim().split("\n");
      let eventType = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (!eventType || !dataStr) continue;

      try {
        const data = JSON.parse(dataStr);
        switch (eventType) {
          case "status":
            onEvent({ type: "status", message: data.message });
            break;
          case "result":
            // Single backtest result
            if (data.results) {
              onEvent({ type: "compare_result", results: data.results });
            } else {
              onEvent({ type: "result", data: data as BacktestResult });
            }
            break;
          case "error":
            onEvent({ type: "error", message: data.message });
            break;
          case "done":
            onEvent({ type: "done" });
            break;
        }
      } catch {
        // skip unparseable
      }
    }
  }
}

// ─── Backtest API ────────────────────────────────────────────────────────────

export const backtestAPI = {
  getStrategies: () => apiRequest<StrategyInfo[]>("/api/backtest/strategies"),

  runBacktest: (
    config: BacktestConfig,
    onEvent: (event: BacktestSSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_BASE}/api/backtest/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail = body?.detail;
          const msg = Array.isArray(detail)
            ? detail.map((d: any) => `${d.loc?.join(".")}: ${d.msg}`).join("; ")
            : typeof detail === "string" ? detail : `${response.status} ${response.statusText}`;
          throw new Error(msg);
        }
        await parseSSEStream(response, onEvent);
        resolve();
      } catch (err: any) {
        if (err?.name === "AbortError") resolve();
        else reject(err);
      }
    });
  },

  compareStrategies: (
    config: BacktestCompareRequest,
    onEvent: (event: BacktestSSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_BASE}/api/backtest/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail = body?.detail;
          const msg = Array.isArray(detail)
            ? detail.map((d: any) => `${d.loc?.join(".")}: ${d.msg}`).join("; ")
            : typeof detail === "string" ? detail : `${response.status} ${response.statusText}`;
          throw new Error(msg);
        }
        await parseSSEStream(response, onEvent);
        resolve();
      } catch (err: any) {
        if (err?.name === "AbortError") resolve();
        else reject(err);
      }
    });
  },
};

// ─── Portfolio API ────────────────────────────────────────────────────────────

export const portfolioAPI = {
  getHoldings: () => apiRequest<Holding[]>("/api/portfolio/holdings"),

  getHoldingsWithMetrics: () =>
    apiRequest<HoldingWithMetrics[]>("/api/portfolio/holdings-with-metrics"),

  getOverview: () => apiRequest<PortfolioOverview>("/api/portfolio/overview"),

  createHolding: (data: HoldingCreate) =>
    apiRequest<Holding>("/api/portfolio/holdings", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateHolding: (id: string, data: Partial<HoldingCreate>) =>
    apiRequest<Holding>(`/api/portfolio/holdings/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteHolding: (id: string) =>
    apiRequest<{ message: string }>(`/api/portfolio/holdings/${id}`, {
      method: "DELETE",
    }),

  uploadCSV: async (file: File): Promise<CSVUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/api/portfolio/upload-csv`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    return response.json();
  },

  reset: () =>
    apiRequest<{ message: string }>("/api/portfolio/reset", { method: "POST" }),
};

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  published: string | null;
}

// ─── Market API ───────────────────────────────────────────────────────────────

export const marketAPI = {
  getIndices: () =>
    apiRequest<IndexQuote[]>("/api/market/indices"),

  getNews: () =>
    apiRequest<NewsArticle[]>("/api/market/news"),

  getQuote: (symbol: string) =>
    apiRequest<MarketQuote>(`/api/market/quote/${symbol}`),

  getQuotes: (symbols: string[]) =>
    apiRequest<Record<string, MarketQuote>>("/api/market/quotes", {
      method: "POST",
      body: JSON.stringify(symbols),
    }),

  search: (query: string) =>
    apiRequest<{ results: any[] }>(`/api/market/search?q=${encodeURIComponent(query)}`),

  getFundamentals: (symbol: string) =>
    apiRequest<any>(`/api/market/fundamentals/${symbol}`),
};
