import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

export type AgentStatus = "pending" | "running" | "complete" | "error";

interface Props {
  agents: Record<string, { status: AgentStatus; duration?: number }>;
}

const AGENT_LABELS: Record<string, string> = {
  sentiment: "SENTIMENT AGENT",
  fundamental: "FUNDAMENTAL AGENT",
  risk: "RISK AGENT",
};

const StatusIcon = ({ status }: { status: AgentStatus }) => {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "hsl(var(--primary))" }} />;
    case "complete":
      return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />;
    case "error":
      return <XCircle className="w-3.5 h-3.5" style={{ color: "hsl(var(--destructive))" }} />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

export const AgentStatusPanel = ({ agents }: Props) => {
  return (
    <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="label mb-3">Agent Status</div>
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(agents).map(([name, info]) => (
          <div
            key={name}
            className="flex items-center gap-2 p-2 border rounded-sm"
            style={{
              borderColor:
                info.status === "complete"
                  ? "hsl(var(--primary) / 0.4)"
                  : info.status === "error"
                  ? "hsl(var(--destructive) / 0.4)"
                  : "hsl(var(--border))",
              background:
                info.status === "running"
                  ? "hsl(var(--primary) / 0.04)"
                  : "transparent",
            }}
          >
            <StatusIcon status={info.status} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-wider truncate">
                {AGENT_LABELS[name] || name.toUpperCase()}
              </div>
              {info.duration !== undefined && info.status === "complete" && (
                <div className="text-[9px] text-muted-foreground">{info.duration.toFixed(1)}s</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
