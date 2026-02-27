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

// ─── Advisor Types ───────────────────────────────────────────────────────────

export interface UserProfile {
  investment_goal: "growth" | "income" | "preservation" | "balanced";
  risk_tolerance: number;
  time_horizon: "short" | "medium" | "long";
  age_range: "18-30" | "31-45" | "46-60" | "60+";
  target_allocation: Record<string, number>;
  sector_preferences: string[];
  sector_exclusions: string[];
  monthly_investment?: number;
  created_at?: string;
}

export interface PortfolioAction {
  action: "BUY" | "SELL" | "HOLD" | "ADD" | "REDUCE";
  symbol: string;
  name: string;
  current_weight?: number;
  target_weight?: number;
  dollar_amount?: number;
  reasoning: string;
  confidence: number;
  data_sources: string[];
  priority: number;
}

export interface AdvisorRecommendation {
  diagnosis: string;
  actions: PortfolioAction[];
  new_stocks: PortfolioAction[];
  risk_warnings: string[];
  briefing: string;
  agents_used: string[];
}

export interface AgentResultData {
  agent_name: string;
  status: "pending" | "running" | "complete" | "error";
  data: Record<string, any>;
  errors: string[];
  duration_seconds: number;
}

export type AdvisorSSEEvent =
  | { type: "profile_loaded"; data: { goal: string; risk_tolerance: number; time_horizon: string } }
  | { type: "status"; message: string }
  | { type: "gaps_identified"; data: { allocation_gaps: Record<string, number>; sector_gaps: string[] } }
  | { type: "agent_start"; agent: string }
  | { type: "agent_complete"; agent: string; data: AgentResultData }
  | { type: "agent_error"; agent: string; errors: string[] }
  | { type: "screener_complete"; data: AgentResultData }
  | { type: "advisor_thinking"; message: string }
  | { type: "recommendation"; data: AdvisorRecommendation }
  | { type: "error"; message: string }
  | { type: "done" };

// ─── Profile API ─────────────────────────────────────────────────────────────

export const profileAPI = {
  save: (profile: UserProfile) =>
    apiRequest<{ status: string }>("/api/profile", {
      method: "POST",
      body: JSON.stringify(profile),
    }),

  get: () => apiRequest<UserProfile>("/api/profile"),

  exists: () => apiRequest<{ exists: boolean }>("/api/profile/exists"),
};

// ─── Advisor API ─────────────────────────────────────────────────────────────

export const advisorAPI = {
  runStreaming: (
    onEvent: (event: AdvisorSSEEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_BASE}/api/advisor/run`, {
          method: "POST",
          signal,
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
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
                case "profile_loaded":
                  onEvent({ type: "profile_loaded", data });
                  break;
                case "status":
                  onEvent({ type: "status", message: data.message });
                  break;
                case "gaps_identified":
                  onEvent({ type: "gaps_identified", data });
                  break;
                case "agent_start":
                  onEvent({ type: "agent_start", agent: data.agent });
                  break;
                case "agent_complete":
                  onEvent({ type: "agent_complete", agent: data.agent, data: data.data });
                  break;
                case "agent_error":
                  onEvent({ type: "agent_error", agent: data.agent, errors: data.errors });
                  break;
                case "screener_complete":
                  onEvent({ type: "screener_complete", data: data.data });
                  break;
                case "advisor_thinking":
                  onEvent({ type: "advisor_thinking", message: data.message });
                  break;
                case "recommendation":
                  onEvent({ type: "recommendation", data: data as AdvisorRecommendation });
                  break;
                case "error":
                  onEvent({ type: "error", message: data.message });
                  break;
                case "done":
                  onEvent({ type: "done" });
                  break;
              }
            } catch {
              // skip unparseable events
            }
          }
        }
        resolve();
      } catch (err: any) {
        if (err?.name === "AbortError") {
          resolve();
        } else {
          reject(err);
        }
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
