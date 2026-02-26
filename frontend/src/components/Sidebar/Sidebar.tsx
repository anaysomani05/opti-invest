import { useState, useEffect } from "react";
import { LayoutDashboard, Briefcase, Activity, Sliders, Radio } from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: "overview", label: "OVERVIEW", icon: LayoutDashboard },
  { id: "portfolio", label: "PORTFOLIO", icon: Briefcase },
  { id: "sentiment", label: "SENTIMENT", icon: Activity },
  { id: "optimization", label: "OPTIMIZE", icon: Sliders },
  { id: "intelligence", label: "SIGNALS", icon: Radio },
];

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export const Sidebar = ({ activeSection, onSectionChange }: SidebarProps) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        width: "188px",
        background: "hsl(var(--sidebar-background))",
        borderRight: "1px solid hsl(var(--sidebar-border))",
      }}
    >
      {/* Logo */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="flex items-center gap-2 mb-2">
          {/* Custom monogram mark */}
          <div
            className="w-5 h-5 flex items-center justify-center text-[10px] font-bold"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            OI
          </div>
          <span className="text-[13px] font-bold tracking-widest text-foreground">
            OPTI<span style={{ color: "hsl(var(--primary))" }}>INVEST</span>
          </span>
        </div>
        <div
          className="text-[10px] tracking-[0.12em]"
          style={{ color: "hsl(var(--sidebar-foreground))" }}
        >
          {time.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                borderLeft: isActive
                  ? "2px solid hsl(var(--primary))"
                  : "2px solid transparent",
                background: isActive ? "hsl(var(--primary) / 0.06)" : "transparent",
                color: isActive
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--sidebar-foreground))",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color =
                    "hsl(var(--foreground))";
                  (e.currentTarget as HTMLElement).style.background =
                    "hsl(var(--sidebar-accent))";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color =
                    "hsl(var(--sidebar-foreground))";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              <Icon
                className="flex-shrink-0"
                style={{
                  width: "13px",
                  height: "13px",
                  color: isActive ? "hsl(var(--primary))" : "inherit",
                }}
              />
              <span
                className="text-[10px] tracking-[0.18em] font-medium"
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Status footer */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "hsl(var(--primary))" }}
          />
          <span
            className="text-[10px] tracking-[0.15em]"
            style={{ color: "hsl(var(--primary))" }}
          >
            LIVE
          </span>
        </div>
        <div
          className="text-[10px] tracking-wider"
          style={{ color: "hsl(var(--sidebar-foreground))" }}
        >
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </aside>
  );
};
