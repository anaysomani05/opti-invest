import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { RiskAlert } from "@/lib/api";

interface Props {
  alerts: RiskAlert[];
}

const SEVERITY_STYLES: Record<string, { color: string; Icon: typeof AlertTriangle }> = {
  high: { color: "hsl(var(--destructive))", Icon: ShieldAlert },
  medium: { color: "hsl(var(--warning))", Icon: AlertTriangle },
  low: { color: "hsl(var(--muted-foreground))", Icon: Info },
};

export const RiskAlertPanel = ({ alerts }: Props) => {
  if (!alerts.length) {
    return (
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-2">Risk Alerts</div>
        <div className="text-xs text-muted-foreground">No active risk alerts.</div>
      </section>
    );
  }

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">Risk Alerts</div>
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;
          const Icon = sev.Icon;
          return (
            <div
              key={i}
              className="flex items-start gap-2.5 p-3 border rounded-sm"
              style={{ borderColor: sev.color + "40" }}
            >
              <Icon
                className="flex-shrink-0 mt-0.5"
                style={{ width: "14px", height: "14px", color: sev.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[9px] tracking-wider font-medium px-1.5 py-0.5 border rounded-sm uppercase"
                    style={{ borderColor: sev.color, color: sev.color }}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-[9px] tracking-wider text-muted-foreground uppercase">
                    {alert.category}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {alert.message}
                </div>
                {alert.affected_symbols.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {alert.affected_symbols.map((sym) => (
                      <span
                        key={sym}
                        className="text-[9px] px-1 py-0.5 border rounded-sm"
                        style={{ borderColor: "hsl(var(--border))" }}
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
