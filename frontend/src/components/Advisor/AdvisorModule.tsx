import { useState, useRef, useCallback, useEffect } from "react";
import {
  advisorAPI,
  profileAPI,
  AdvisorSSEEvent,
  AdvisorRecommendation,
  PortfolioAction,
  UserProfile,
  AgentResultData,
} from "@/lib/api";
import {
  Play,
  Check,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";

type AgentStatus = "pending" | "running" | "complete" | "error";

interface AgentProgress {
  name: string;
  status: AgentStatus;
  duration?: number;
  error?: string;
}

interface AdvisorModuleProps {
  onEditProfile?: () => void;
}

export const AdvisorModule = ({ onEditProfile }: AdvisorModuleProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<AgentProgress[]>([]);
  const [recommendation, setRecommendation] = useState<AdvisorRecommendation | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [briefingOpen, setBriefingOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    profileAPI.get().then(setProfile).catch(() => {});
  }, []);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setRecommendation(null);
    setAgents([]);
    setStatusMsg("Initializing...");
    setErrorMsg("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await advisorAPI.runStreaming((event: AdvisorSSEEvent) => {
        switch (event.type) {
          case "profile_loaded":
            setStatusMsg("Profile loaded, analyzing portfolio...");
            break;
          case "status":
            setStatusMsg(event.message);
            break;
          case "gaps_identified":
            setStatusMsg("Gaps identified, launching agents...");
            break;
          case "agent_start":
            setAgents(prev => {
              const exists = prev.find(a => a.name === event.agent);
              if (exists) return prev.map(a => a.name === event.agent ? { ...a, status: "running" } : a);
              return [...prev, { name: event.agent, status: "running" }];
            });
            break;
          case "agent_complete":
            setAgents(prev =>
              prev.map(a =>
                a.name === event.agent
                  ? { ...a, status: "complete", duration: (event.data as AgentResultData)?.duration_seconds }
                  : a
              )
            );
            break;
          case "agent_error":
            setAgents(prev =>
              prev.map(a =>
                a.name === event.agent ? { ...a, status: "error", error: event.errors?.[0] } : a
              )
            );
            break;
          case "screener_complete":
            setAgents(prev => {
              const exists = prev.find(a => a.name === "screener");
              if (exists) return prev.map(a => a.name === "screener" ? { ...a, status: "complete" } : a);
              return [...prev, { name: "screener", status: "complete" }];
            });
            break;
          case "advisor_thinking":
            setStatusMsg(event.message);
            break;
          case "recommendation":
            setRecommendation(event.data);
            setStatusMsg("");
            break;
          case "error":
            setErrorMsg(event.message);
            break;
          case "done":
            setRunning(false);
            setStatusMsg("");
            break;
        }
      }, ctrl.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setErrorMsg(err.message || "Analysis failed");
      }
    } finally {
      setRunning(false);
    }
  }, []);

  const stopAnalysis = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatusMsg("");
  };

  // ── Profile strip ──
  const ProfileStrip = () => {
    if (!profile) return null;
    return (
      <div className="metrics-strip mb-4">
        <div className="metric-cell">
          <span className="label">GOAL</span>
          <span className="stat-value">{profile.investment_goal.toUpperCase()}</span>
        </div>
        <div className="metric-cell">
          <span className="label">RISK</span>
          <span className="stat-value">{profile.risk_tolerance}/10</span>
        </div>
        <div className="metric-cell">
          <span className="label">HORIZON</span>
          <span className="stat-value">{profile.time_horizon.toUpperCase()}</span>
        </div>
        <div className="metric-cell">
          <span className="label">STOCKS</span>
          <span className="stat-value">{((profile.target_allocation?.stocks || 0) * 100).toFixed(0)}%</span>
        </div>
        <div className="metric-cell">
          <span className="label">BONDS</span>
          <span className="stat-value">{((profile.target_allocation?.bonds || 0) * 100).toFixed(0)}%</span>
        </div>
        {onEditProfile && (
          <button onClick={onEditProfile} className="flex items-center gap-1 text-[10px] tracking-wider px-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            <Settings2 style={{ width: 11, height: 11 }} /> EDIT
          </button>
        )}
      </div>
    );
  };

  // ── Agent checklist ──
  const AgentChecklist = () => {
    if (agents.length === 0) return null;
    return (
      <div className="mb-4 p-3" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="label mb-2">AGENT PROGRESS</div>
        <div className="space-y-1.5">
          {agents.map(a => (
            <div key={a.name} className="flex items-center gap-2">
              {a.status === "running" && <Loader2 className="animate-spin" style={{ width: 11, height: 11, color: "hsl(var(--primary))" }} />}
              {a.status === "complete" && <Check style={{ width: 11, height: 11, color: "hsl(var(--primary))" }} />}
              {a.status === "error" && <AlertTriangle style={{ width: 11, height: 11, color: "hsl(var(--destructive))" }} />}
              {a.status === "pending" && <div className="w-[11px] h-[11px] rounded-full" style={{ border: "1px solid hsl(var(--border))" }} />}
              <span className="text-[10px] tracking-[0.15em] flex-1" style={{
                color: a.status === "error" ? "hsl(var(--destructive))" : a.status === "complete" ? "hsl(var(--primary))" : "hsl(var(--foreground))"
              }}>
                {a.name.toUpperCase()}
              </span>
              {a.duration !== undefined && (
                <span className="text-[9px] text-muted-foreground">{a.duration.toFixed(1)}s</span>
              )}
              {a.error && <span className="text-[9px]" style={{ color: "hsl(var(--destructive))" }}>{a.error}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Action row ──
  const ActionBadge = ({ action }: { action: string }) => {
    const colors: Record<string, string> = {
      HOLD: "hsl(var(--muted-foreground))",
      BUY: "hsl(var(--primary))",
      ADD: "hsl(var(--primary))",
      SELL: "hsl(var(--destructive))",
      REDUCE: "hsl(var(--warning))",
    };
    return (
      <span className="text-[9px] font-bold tracking-[0.15em] px-1.5 py-0.5" style={{
        border: `1px solid ${colors[action] || "hsl(var(--border))"}`,
        color: colors[action] || "hsl(var(--foreground))",
      }}>
        {action}
      </span>
    );
  };

  // ── Actions table ──
  const ActionsTable = ({ actions, title }: { actions: PortfolioAction[]; title: string }) => {
    if (!actions.length) return null;
    return (
      <div className="mb-4">
        <div className="label mb-2">{title}</div>
        <div style={{ border: "1px solid hsl(var(--border))" }}>
          <div className="tr" style={{ background: "hsl(var(--secondary))" }}>
            <span className="th" style={{ width: 60 }}>ACTION</span>
            <span className="th" style={{ width: 70 }}>SYMBOL</span>
            <span className="th flex-1">REASONING</span>
            <span className="th" style={{ width: 70 }}>CURRENT</span>
            <span className="th" style={{ width: 70 }}>TARGET</span>
            <span className="th" style={{ width: 80 }}>AMOUNT</span>
            <span className="th" style={{ width: 50 }}>CONF</span>
          </div>
          {actions.map((a, i) => (
            <div key={i} className="tr">
              <span className="td" style={{ width: 60 }}><ActionBadge action={a.action} /></span>
              <span className="td font-bold" style={{ width: 70, color: "hsl(var(--foreground))" }}>{a.symbol}</span>
              <span className="td flex-1 text-muted-foreground" style={{ fontSize: "10px" }}>{a.reasoning}</span>
              <span className="td" style={{ width: 70 }}>{a.current_weight != null ? `${(a.current_weight * 100).toFixed(1)}%` : "—"}</span>
              <span className="td" style={{ width: 70 }}>{a.target_weight != null ? `${(a.target_weight * 100).toFixed(1)}%` : "—"}</span>
              <span className="td" style={{ width: 80, color: "hsl(var(--primary))" }}>
                {a.dollar_amount != null && a.dollar_amount > 0 ? `$${a.dollar_amount.toLocaleString()}` : "—"}
              </span>
              <span className="td" style={{ width: 50 }}>{(a.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-5">
      <ProfileStrip />

      {/* Run button */}
      <div className="flex items-center gap-3 mb-4">
        {!running ? (
          <button onClick={runAnalysis} className="btn-terminal-primary flex items-center gap-2">
            <Play style={{ width: 12, height: 12 }} /> RUN ANALYSIS
          </button>
        ) : (
          <button onClick={stopAnalysis} className="btn-terminal flex items-center gap-2" style={{ borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" }}>
            STOP
          </button>
        )}
        {statusMsg && (
          <span className="text-[10px] tracking-wider text-muted-foreground flex items-center gap-2">
            <Loader2 className="animate-spin" style={{ width: 11, height: 11 }} />
            {statusMsg}
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 mb-4" style={{ border: "1px solid hsl(var(--destructive))", background: "hsl(var(--destructive) / 0.06)" }}>
          <span className="text-[10px]" style={{ color: "hsl(var(--destructive))" }}>{errorMsg}</span>
        </div>
      )}

      <AgentChecklist />

      {/* Recommendation */}
      {recommendation && (
        <div>
          {/* Diagnosis */}
          <div className="p-3 mb-4" style={{ border: "1px solid hsl(var(--primary) / 0.3)", background: "hsl(var(--primary) / 0.04)" }}>
            <div className="label mb-1">DIAGNOSIS</div>
            <p className="text-[11px] text-foreground leading-relaxed">{recommendation.diagnosis}</p>
          </div>

          {/* Existing holdings actions */}
          <ActionsTable actions={recommendation.actions} title="PORTFOLIO ACTIONS" />

          {/* New stocks */}
          <ActionsTable actions={recommendation.new_stocks} title="NEW STOCK RECOMMENDATIONS" />

          {/* Risk warnings */}
          {recommendation.risk_warnings.length > 0 && (
            <div className="mb-4">
              <div className="label mb-2">RISK WARNINGS</div>
              <div className="space-y-2">
                {recommendation.risk_warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2" style={{ border: "1px solid hsl(var(--warning) / 0.4)", background: "hsl(var(--warning) / 0.04)" }}>
                    <AlertTriangle style={{ width: 12, height: 12, color: "hsl(var(--warning))", flexShrink: 0, marginTop: 1 }} />
                    <span className="text-[10px]" style={{ color: "hsl(var(--warning))" }}>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Briefing */}
          {recommendation.briefing && (
            <div className="mb-4">
              <button onClick={() => setBriefingOpen(!briefingOpen)} className="flex items-center gap-2 label mb-2 cursor-pointer">
                FULL BRIEFING
                {briefingOpen ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />}
              </button>
              {briefingOpen && (
                <div className="p-3" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
                  <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-line">{recommendation.briefing}</p>
                </div>
              )}
            </div>
          )}

          {/* Agents used */}
          {recommendation.agents_used.length > 0 && (
            <div className="text-[9px] text-muted-foreground tracking-wider">
              AGENTS: {recommendation.agents_used.map(a => a.toUpperCase()).join(" / ")}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!running && !recommendation && !errorMsg && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-[11px] text-muted-foreground mb-2">
            Run analysis to get personalized portfolio recommendations
          </div>
          <div className="text-[10px] text-muted-foreground">
            Based on your profile, our AI agents will analyze your holdings and suggest actions
          </div>
        </div>
      )}
    </div>
  );
};
