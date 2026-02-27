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
  Settings2,
  Terminal,
  Activity,
  TrendingDown,
  TrendingUp,
  Minus,
  ShieldAlert,
  BarChart3,
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

const ACTION_ORDER: Record<string, number> = { SELL: 0, REDUCE: 1, HOLD: 2, ADD: 3, BUY: 4 };
const ACTION_COLORS: Record<string, string> = {
  HOLD: "hsl(var(--muted-foreground))",
  BUY: "hsl(var(--primary))",
  ADD: "hsl(var(--primary))",
  SELL: "hsl(var(--destructive))",
  REDUCE: "hsl(var(--warning))",
};

function sortActions(actions: PortfolioAction[]): PortfolioAction[] {
  return [...actions].sort((a, b) => {
    const orderDiff = (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return b.confidence - a.confidence;
  });
}

function computeHealthScore(actions: PortfolioAction[]): number {
  if (!actions.length) return 0;
  const weights: Record<string, number> = { HOLD: 80, BUY: 60, ADD: 65, REDUCE: 40, SELL: 20 };
  const total = actions.reduce((sum, a) => sum + (weights[a.action] ?? 50), 0);
  return Math.round(total / actions.length);
}

export const AdvisorModule = ({ onEditProfile }: AdvisorModuleProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<AgentProgress[]>([]);
  const [recommendation, setRecommendation] = useState<AdvisorRecommendation | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    profileAPI.get().then(setProfile).catch(() => {});
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

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

  const completedAgents = agents.filter(a => a.status === "complete").length;
  const totalAgents = agents.length;

  // Derive phase
  const phase = !running
    ? ""
    : agents.length === 0
      ? "DATA COLLECTION"
      : completedAgents < totalAgents
        ? "ANALYSIS"
        : "SYNTHESIS";

  // ── Compact Profile Strip ──
  const ProfileStrip = () => {
    if (!profile) return null;
    const chips: { label: string; value: string }[] = [
      { label: "GOAL", value: profile.investment_goal.toUpperCase() },
      { label: "RISK", value: `${profile.risk_tolerance}/10` },
      { label: "HORIZON", value: profile.time_horizon.toUpperCase() },
      { label: "STK", value: `${((profile.target_allocation?.stocks || 0) * 100).toFixed(0)}%` },
      { label: "BND", value: `${((profile.target_allocation?.bonds || 0) * 100).toFixed(0)}%` },
    ];
    return (
      <div className="flex items-center gap-2 mb-4 flex-wrap" style={{ borderBottom: "1px solid hsl(var(--border))", paddingBottom: 8 }}>
        {chips.map(c => (
          <span key={c.label} className="inline-flex items-center gap-1.5 px-2 py-1" style={{
            background: "hsl(var(--secondary))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}>
            <span className="text-[9px] tracking-[0.15em] text-muted-foreground">{c.label}</span>
            <span className="text-[11px] font-semibold text-foreground">{c.value}</span>
          </span>
        ))}
        {onEditProfile && (
          <button onClick={onEditProfile} className="inline-flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider text-muted-foreground hover:text-foreground transition-colors ml-auto" style={{
            border: "1px solid hsl(var(--border))",
            borderRadius: "var(--radius)",
          }}>
            <Settings2 style={{ width: 10, height: 10 }} /> EDIT
          </button>
        )}
      </div>
    );
  };

  // ── Agent Progress Panel ──
  const AgentPanel = () => {
    if (agents.length === 0 && !running) return null;
    const pct = totalAgents > 0 ? (completedAgents / totalAgents) * 100 : 0;
    return (
      <div className="mb-4 p-3" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="label">AGENT PROGRESS</div>
          <div className="flex items-center gap-3">
            {phase && (
              <span className="text-[9px] tracking-[0.15em] font-semibold" style={{ color: "hsl(var(--primary))" }}>
                {phase === "DATA COLLECTION" ? "DATA COLLECTION → ANALYSIS → SYNTHESIS" :
                  phase === "ANALYSIS" ? "DATA COLLECTION → ANALYSIS → SYNTHESIS" :
                    "DATA COLLECTION → ANALYSIS → SYNTHESIS"}
              </span>
            )}
            {running && (
              <span className="text-[9px] tracking-wider text-muted-foreground tabular-nums">
                {elapsed}s
              </span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="bar-track mb-3" style={{ height: 3 }}>
          <div className="bar-fill" style={{ width: `${pct}%`, transition: "width 0.4s ease" }} />
        </div>
        {/* Phase indicators */}
        {phase && (
          <div className="flex items-center gap-4 mb-3">
            {["DATA COLLECTION", "ANALYSIS", "SYNTHESIS"].map(p => (
              <span key={p} className="text-[9px] tracking-[0.12em] font-medium" style={{
                color: p === phase ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                opacity: p === phase ? 1 : 0.4,
              }}>
                {p === phase ? "● " : "○ "}{p}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-muted-foreground tracking-wider">{completedAgents}/{totalAgents} AGENTS COMPLETE</span>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {agents.map(a => (
            <div key={a.name} className="flex items-center gap-2 px-2 py-1" style={{
              background: a.status === "complete" ? "hsl(var(--primary) / 0.04)" :
                a.status === "error" ? "hsl(var(--destructive) / 0.04)" : "transparent",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}>
              {a.status === "running" && <Loader2 className="animate-spin" style={{ width: 10, height: 10, color: "hsl(var(--primary))" }} />}
              {a.status === "complete" && <Check style={{ width: 10, height: 10, color: "hsl(var(--primary))" }} />}
              {a.status === "error" && <AlertTriangle style={{ width: 10, height: 10, color: "hsl(var(--destructive))" }} />}
              {a.status === "pending" && <div style={{ width: 10, height: 10, borderRadius: "50%", border: "1px solid hsl(var(--border))" }} />}
              <span className="text-[9px] tracking-[0.12em] flex-1 truncate" style={{
                color: a.status === "error" ? "hsl(var(--destructive))" : a.status === "complete" ? "hsl(var(--primary))" : "hsl(var(--foreground))"
              }}>
                {a.name.toUpperCase()}
              </span>
              {a.duration !== undefined && (
                <span className="text-[8px] text-muted-foreground tabular-nums">{a.duration.toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
        {agents.some(a => a.error) && (
          <div className="mt-2 space-y-1">
            {agents.filter(a => a.error).map(a => (
              <div key={a.name} className="text-[9px]" style={{ color: "hsl(var(--destructive))" }}>
                {a.name.toUpperCase()}: {a.error}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Action Card ──
  const ActionCard = ({ a }: { a: PortfolioAction }) => {
    const color = ACTION_COLORS[a.action] || "hsl(var(--border))";
    const confPct = Math.round(a.confidence * 100);
    const ActionIcon = a.action === "SELL" || a.action === "REDUCE" ? TrendingDown :
      a.action === "BUY" || a.action === "ADD" ? TrendingUp : Minus;
    return (
      <div className="flex flex-col" style={{
        border: "1px solid hsl(var(--border))",
        borderLeft: `3px solid ${color}`,
        background: "hsl(var(--card))",
        borderRadius: "var(--radius)",
      }}>
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Action badge */}
          <span className="text-[9px] font-bold tracking-[0.15em] px-1.5 py-0.5 shrink-0" style={{
            border: `1px solid ${color}`,
            color: color,
            borderRadius: "var(--radius)",
            minWidth: 44,
            textAlign: "center",
          }}>
            {a.action}
          </span>
          {/* Symbol */}
          <span className="text-[12px] font-bold text-foreground shrink-0">{a.symbol}</span>
          {/* Weight change */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {a.current_weight != null && a.target_weight != null ? (
              <>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {(a.current_weight * 100).toFixed(1)}%
                </span>
                <ActionIcon style={{ width: 10, height: 10, color }} />
                <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>
                  {(a.target_weight * 100).toFixed(1)}%
                </span>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
          {/* Dollar amount */}
          {a.dollar_amount != null && a.dollar_amount > 0 && (
            <span className="text-[10px] font-semibold shrink-0 tabular-nums" style={{ color: "hsl(var(--primary))" }}>
              ${a.dollar_amount.toLocaleString()}
            </span>
          )}
          {/* Confidence bar */}
          <div className="flex items-center gap-1.5 shrink-0" style={{ minWidth: 60 }}>
            <div className="bar-track flex-1" style={{ height: 3, minWidth: 30 }}>
              <div className="bar-fill" style={{ width: `${confPct}%`, background: color }} />
            </div>
            <span className="text-[9px] tabular-nums text-muted-foreground">{confPct}%</span>
          </div>
        </div>
        {/* Reasoning */}
        {a.reasoning && (
          <div className="px-3 pb-2" style={{ paddingLeft: 16 }}>
            <span className="text-[10px] text-muted-foreground leading-relaxed">{a.reasoning}</span>
          </div>
        )}
      </div>
    );
  };

  // ── Actions Group ──
  const ActionsGroup = ({ actions, title }: { actions: PortfolioAction[]; title: string }) => {
    if (!actions.length) return null;
    const sorted = sortActions(actions);
    return (
      <div className="mb-5">
        <div className="label mb-2">{title}</div>
        <div className="grid gap-2">
          {sorted.map((a, i) => <ActionCard key={i} a={a} />)}
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

      <AgentPanel />

      {/* Recommendation Results */}
      {recommendation && (
        <div>
          {/* Diagnosis */}
          <div className="mb-4 p-4" style={{
            border: "1px solid hsl(var(--primary) / 0.3)",
            background: "hsl(var(--primary) / 0.04)",
            borderLeft: "3px solid hsl(var(--primary))",
            borderRadius: "var(--radius)",
          }}>
            <div className="flex items-center gap-2 mb-2">
              <Activity style={{ width: 13, height: 13, color: "hsl(var(--primary))" }} />
              <span className="text-[11px] font-bold tracking-[0.15em]" style={{ color: "hsl(var(--primary))" }}>DIAGNOSIS</span>
            </div>
            <p className="text-[12px] text-foreground leading-relaxed">{recommendation.diagnosis}</p>
          </div>

          {/* Summary strip */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-1" style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}>
              <BarChart3 style={{ width: 10, height: 10, color: "hsl(var(--muted-foreground))" }} />
              <span className="text-[9px] tracking-wider text-muted-foreground">HOLDINGS</span>
              <span className="text-[11px] font-semibold text-foreground">{recommendation.actions.length}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1" style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}>
              <Terminal style={{ width: 10, height: 10, color: "hsl(var(--muted-foreground))" }} />
              <span className="text-[9px] tracking-wider text-muted-foreground">AGENTS</span>
              <span className="text-[11px] font-semibold text-foreground">{recommendation.agents_used.length}</span>
            </span>
            {(() => {
              const health = computeHealthScore(recommendation.actions);
              const hColor = health >= 70 ? "hsl(var(--primary))" : health >= 45 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
              return (
                <span className="inline-flex items-center gap-1.5 px-2 py-1" style={{
                  background: "hsl(var(--secondary))",
                  border: `1px solid ${hColor}`,
                  borderRadius: "var(--radius)",
                }}>
                  <ShieldAlert style={{ width: 10, height: 10, color: hColor }} />
                  <span className="text-[9px] tracking-wider text-muted-foreground">HEALTH</span>
                  <span className="text-[11px] font-semibold" style={{ color: hColor }}>{health}</span>
                </span>
              );
            })()}
          </div>

          {/* Portfolio actions */}
          <ActionsGroup actions={recommendation.actions} title="PORTFOLIO ACTIONS" />

          {/* New stocks */}
          <ActionsGroup actions={recommendation.new_stocks} title="NEW STOCK RECOMMENDATIONS" />

          {/* Risk warnings */}
          {recommendation.risk_warnings.length > 0 && (
            <div className="mb-5">
              <div className="label mb-2">RISK WARNINGS</div>
              <div className="grid gap-2">
                {recommendation.risk_warnings.map((w, i) => {
                  const severity = i === 0 ? "hsl(var(--destructive))" : "hsl(var(--warning))";
                  return (
                    <div key={i} className="flex items-start gap-3 p-3" style={{
                      border: `1px solid ${severity}`,
                      borderLeft: `3px solid ${severity}`,
                      background: `${severity.replace(")", " / 0.04)")}`,
                      borderRadius: "var(--radius)",
                    }}>
                      <AlertTriangle style={{ width: 13, height: 13, color: severity, flexShrink: 0, marginTop: 1 }} />
                      <span className="text-[11px] leading-relaxed" style={{ color: severity }}>{w}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Briefing — always visible */}
          {recommendation.briefing && (
            <div className="mb-5">
              <div className="label mb-2">ANALYST BRIEFING</div>
              <div className="p-4" style={{
                border: "1px solid hsl(var(--border))",
                borderLeft: "3px solid hsl(var(--primary))",
                background: "hsl(var(--card))",
                borderRadius: "var(--radius)",
              }}>
                <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-line">{recommendation.briefing}</p>
              </div>
            </div>
          )}

          {/* Agents used — pill badges */}
          {recommendation.agents_used.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] tracking-wider text-muted-foreground mr-1">AGENTS:</span>
              {recommendation.agents_used.map(a => (
                <span key={a} className="text-[8px] tracking-[0.12em] px-2 py-0.5 font-medium" style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--primary))",
                  borderRadius: "var(--radius)",
                }}>
                  {a.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!running && !recommendation && !errorMsg && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-[11px] text-muted-foreground">
            Run analysis to get AI-powered portfolio recommendations
          </div>
        </div>
      )}
    </div>
  );
};
