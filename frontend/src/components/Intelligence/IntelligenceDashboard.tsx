import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PieChart, Radio, X } from "lucide-react";
import {
  intelligenceAPI,
  portfolioAPI,
  type DiscoverySuggestion,
  type HoldingWithMetrics,
  type IntelSSEEvent,
  type NewsItem,
  type RiskAlert,
  type StockSignal,
} from "@/lib/api";
import { AgentStatusPanel, type AgentStatus } from "@/components/OptimisationModule/AgentStatusPanel";
import { SignalGrid } from "./SignalGrid";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { NewsFeed } from "./NewsFeed";
import { RiskAlertPanel } from "./RiskAlertPanel";
import { IntelBriefingPanel } from "./IntelBriefingPanel";

interface Props {
  onNavigateToPortfolio?: () => void;
}

interface AgentState {
  status: AgentStatus;
  duration?: number;
}

export const IntelligenceDashboard = ({ onNavigateToPortfolio }: Props) => {
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Agent states
  const [agents, setAgents] = useState<Record<string, AgentState>>({
    sentiment: { status: "pending" },
    fundamental: { status: "pending" },
    risk: { status: "pending" },
  });

  // Results
  const [signals, setSignals] = useState<StockSignal[]>([]);
  const [discovery, setDiscovery] = useState<DiscoverySuggestion[]>([]);
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [briefing, setBriefing] = useState("");
  const [error, setError] = useState("");

  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } =
    useQuery<HoldingWithMetrics[]>({
      queryKey: ["holdings-with-metrics"],
      queryFn: portfolioAPI.getHoldingsWithMetrics,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  const handleEvent = useCallback((event: IntelSSEEvent) => {
    switch (event.type) {
      case "agent_start":
        setAgents((prev) => ({
          ...prev,
          [event.agent]: { status: "running" },
        }));
        break;
      case "agent_complete":
        setAgents((prev) => ({
          ...prev,
          [event.agent]: { status: "complete", duration: event.data.duration_seconds },
        }));
        break;
      case "agent_error":
        setAgents((prev) => ({
          ...prev,
          [event.agent]: { status: "error" },
        }));
        break;
      case "status":
        setStatusMsg(event.message);
        break;
      case "signals":
        setSignals(event.data);
        break;
      case "discovery":
        setDiscovery(event.data);
        break;
      case "news_feed":
        setNewsFeed(event.data);
        break;
      case "risk_alerts":
        setRiskAlerts(event.data);
        break;
      case "briefing":
        setBriefing(event.text);
        break;
      case "error":
        setError(event.message);
        break;
      case "done":
        setRunning(false);
        setStatusMsg("");
        break;
    }
  }, []);

  const runScan = useCallback(() => {
    if (running) return;

    // Reset state
    setRunning(true);
    setError("");
    setStatusMsg("Initializing...");
    setSignals([]);
    setDiscovery([]);
    setNewsFeed([]);
    setRiskAlerts([]);
    setBriefing("");
    setAgents({
      sentiment: { status: "pending" },
      fundamental: { status: "pending" },
      risk: { status: "pending" },
    });

    const controller = new AbortController();
    abortRef.current = controller;

    intelligenceAPI
      .runStreaming(handleEvent, controller.signal)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Intelligence scan failed");
        }
      })
      .finally(() => {
        setRunning(false);
        setStatusMsg("");
      });
  }, [running, handleEvent]);

  const cancel = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatusMsg("");
  };

  // Error/loading states
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

  if (holdings.length < 3) {
    return (
      <div className="py-16 text-center">
        <PieChart className="w-8 h-8 mx-auto mb-3" style={{ color: "hsl(var(--muted-foreground))" }} />
        <div className="text-xs text-muted-foreground tracking-[0.15em] mb-2">
          {holdings.length === 0
            ? "NO HOLDINGS — INTELLIGENCE REQUIRES AT LEAST 3"
            : `ONLY ${holdings.length} HOLDING${holdings.length > 1 ? "S" : ""} — NEED AT LEAST 3`}
        </div>
        <button className="btn-terminal" onClick={onNavigateToPortfolio}>
          GO TO PORTFOLIO
        </button>
      </div>
    );
  }

  const hasResults = signals.length > 0 || discovery.length > 0 || newsFeed.length > 0 || riskAlerts.length > 0 || briefing;

  return (
    <div className="space-y-4 p-5">
      {/* Control strip */}
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-3">AI Intelligence Scanner</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              className="btn-terminal-primary flex items-center gap-2"
              onClick={runScan}
              disabled={running}
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  SCANNING...
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5" />
                  RUN INTELLIGENCE SCAN
                </>
              )}
            </button>
            {running && (
              <button className="btn-terminal flex items-center gap-1" onClick={cancel}>
                <X className="w-3 h-3" /> CANCEL
              </button>
            )}
          </div>
        </div>
        {statusMsg && (
          <div className="mt-2 text-[10px] text-muted-foreground tracking-wider animate-pulse">
            {statusMsg}
          </div>
        )}
      </section>

      {/* Error */}
      {error && (
        <div
          className="p-3 border rounded-sm text-xs"
          style={{ borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" }}
        >
          {error}
        </div>
      )}

      {/* Agent status */}
      {(running || hasResults) && <AgentStatusPanel agents={agents} />}

      {/* Progressive panels */}
      {signals.length > 0 && <SignalGrid signals={signals} />}
      {riskAlerts.length > 0 && <RiskAlertPanel alerts={riskAlerts} />}
      {newsFeed.length > 0 && <NewsFeed items={newsFeed} />}
      {discovery.length > 0 && <DiscoveryPanel suggestions={discovery} />}
      {briefing && <IntelBriefingPanel text={briefing} />}
    </div>
  );
};
