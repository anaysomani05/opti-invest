import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Loader2, PieChart, X } from "lucide-react";
import {
  agentOptimizationAPI,
  portfolioAPI,
  type AgentSSEEvent,
  type BLOptimizationResult,
  type FundamentalAgentOutput,
  type HoldingWithMetrics,
  type RiskAgentOutput,
  type SentimentAgentOutput,
} from "@/lib/api";
import { AgentStatusPanel, type AgentStatus } from "./AgentStatusPanel";
import { SentimentAgentPanel } from "./SentimentAgentPanel";
import { FundamentalAgentPanel } from "./FundamentalAgentPanel";
import { RiskAgentPanel } from "./RiskAgentPanel";
import { BlackLittermanPanel } from "./BlackLittermanPanel";
import { AgentReportPanel } from "./AgentReportPanel";

interface Props {
  onNavigateToPortfolio?: () => void;
}

const riskProfiles = ["conservative", "moderate", "aggressive"] as const;

interface AgentState {
  status: AgentStatus;
  duration?: number;
}

export const AgentOptimizationModule = ({ onNavigateToPortfolio }: Props) => {
  const [riskProfile, setRiskProfile] = useState<(typeof riskProfiles)[number]>("moderate");
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
  const [sentimentData, setSentimentData] = useState<SentimentAgentOutput | null>(null);
  const [fundamentalData, setFundamentalData] = useState<FundamentalAgentOutput | null>(null);
  const [riskData, setRiskData] = useState<RiskAgentOutput | null>(null);
  const [blResult, setBlResult] = useState<BLOptimizationResult | null>(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");

  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } =
    useQuery<HoldingWithMetrics[]>({
      queryKey: ["holdings-with-metrics"],
      queryFn: portfolioAPI.getHoldingsWithMetrics,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  const handleEvent = useCallback((event: AgentSSEEvent) => {
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
        if (event.agent === "sentiment") setSentimentData(event.data.data as any);
        if (event.agent === "fundamental") setFundamentalData(event.data.data as any);
        if (event.agent === "risk") setRiskData(event.data.data as any);
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
      case "bl_complete":
        setBlResult(event.data);
        break;
      case "report":
        setReport(event.text);
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

  const runAnalysis = useCallback(() => {
    if (running) return;

    // Reset state
    setRunning(true);
    setError("");
    setStatusMsg("Initializing...");
    setSentimentData(null);
    setFundamentalData(null);
    setRiskData(null);
    setBlResult(null);
    setReport("");
    setAgents({
      sentiment: { status: "pending" },
      fundamental: { status: "pending" },
      risk: { status: "pending" },
    });

    const controller = new AbortController();
    abortRef.current = controller;

    agentOptimizationAPI
      .runStreaming(riskProfile, handleEvent, controller.signal)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Analysis failed");
        }
      })
      .finally(() => {
        setRunning(false);
        setStatusMsg("");
      });
  }, [running, riskProfile, handleEvent]);

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
            ? "NO HOLDINGS — ANALYSIS REQUIRES AT LEAST 3"
            : `ONLY ${holdings.length} HOLDING${holdings.length > 1 ? "S" : ""} — NEED AT LEAST 3`}
        </div>
        <button className="btn-terminal" onClick={onNavigateToPortfolio}>
          GO TO PORTFOLIO
        </button>
      </div>
    );
  }

  const hasResults = sentimentData || fundamentalData || riskData || blResult;

  return (
    <div className="space-y-4 p-5">
      {/* Control strip */}
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-3">AI Agent Optimization</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {riskProfiles.map((p) => (
              <button
                key={p}
                onClick={() => !running && setRiskProfile(p)}
                className="px-3 py-2 text-[11px] tracking-wider border"
                style={{
                  borderColor: riskProfile === p ? "hsl(var(--primary))" : "hsl(var(--border))",
                  background: riskProfile === p ? "hsl(var(--primary) / 0.08)" : "transparent",
                  opacity: running ? 0.5 : 1,
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-terminal-primary flex items-center gap-2"
              onClick={runAnalysis}
              disabled={running}
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  RUNNING...
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  RUN AI ANALYSIS
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
        <div className="p-3 border rounded-sm text-xs" style={{ borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" }}>
          {error}
        </div>
      )}

      {/* Agent status */}
      {(running || hasResults) && <AgentStatusPanel agents={agents} />}

      {/* Progressive panels */}
      {sentimentData && <SentimentAgentPanel data={sentimentData} />}
      {fundamentalData && <FundamentalAgentPanel data={fundamentalData} />}
      {riskData && <RiskAgentPanel data={riskData} />}
      {blResult && <BlackLittermanPanel data={blResult} />}
      {report && <AgentReportPanel text={report} />}
    </div>
  );
};
