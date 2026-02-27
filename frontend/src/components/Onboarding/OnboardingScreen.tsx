import { useState, useCallback } from "react";
import { profileAPI, UserProfile } from "@/lib/api";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

interface OnboardingScreenProps {
  onComplete: () => void;
}

const GOALS = [
  { id: "growth", label: "GROWTH", desc: "Maximize long-term capital appreciation" },
  { id: "income", label: "INCOME", desc: "Generate steady dividend & interest income" },
  { id: "preservation", label: "PRESERVATION", desc: "Protect capital with minimal risk" },
  { id: "balanced", label: "BALANCED", desc: "Mix of growth and income" },
] as const;

const HORIZONS = [
  { id: "short", label: "SHORT", desc: "< 3 years" },
  { id: "medium", label: "MEDIUM", desc: "3-10 years" },
  { id: "long", label: "LONG", desc: "10+ years" },
] as const;

const AGES = [
  { id: "18-30", label: "18-30" },
  { id: "31-45", label: "31-45" },
  { id: "46-60", label: "46-60" },
  { id: "60+", label: "60+" },
] as const;

const SECTORS = [
  "Technology", "Healthcare", "Financials", "Energy",
  "Consumer Discretionary", "Consumer Staples", "Industrials",
  "Materials", "Utilities", "Real Estate", "Communication Services",
];

const RISK_LABELS: Record<number, string> = {
  1: "VERY CONSERVATIVE",
  2: "CONSERVATIVE",
  3: "MODERATELY CONSERVATIVE",
  4: "MODERATE-LOW",
  5: "MODERATE",
  6: "MODERATE-HIGH",
  7: "MODERATELY AGGRESSIVE",
  8: "AGGRESSIVE",
  9: "VERY AGGRESSIVE",
  10: "MAXIMUM RISK",
};

function getDefaultAllocation(goal: string, risk: number): Record<string, number> {
  if (goal === "preservation") return { stocks: 20, etfs: 30, bonds: 50, crypto: 0 };
  if (goal === "income") return { stocks: 30, etfs: 30, bonds: 35, crypto: 5 };
  if (goal === "growth") {
    if (risk >= 8) return { stocks: 70, etfs: 20, bonds: 5, crypto: 5 };
    return { stocks: 60, etfs: 25, bonds: 10, crypto: 5 };
  }
  // balanced
  return { stocks: 45, etfs: 25, bonds: 25, crypto: 5 };
}

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string>("");
  const [risk, setRisk] = useState(5);
  const [horizon, setHorizon] = useState("");
  const [age, setAge] = useState("");
  const [allocation, setAllocation] = useState({ stocks: 50, etfs: 25, bonds: 20, crypto: 5 });
  const [sectorPrefs, setSectorPrefs] = useState<string[]>([]);
  const [sectorExclusions, setSectorExclusions] = useState<string[]>([]);
  const [monthly, setMonthly] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const totalAlloc = allocation.stocks + allocation.etfs + allocation.bonds + allocation.crypto;

  const canNext = () => {
    if (step === 0) return !!goal;
    if (step === 1) return true;
    if (step === 2) return !!horizon && !!age;
    if (step === 3) return totalAlloc === 100;
    return true;
  };

  const handleNext = useCallback(() => {
    if (step === 0 && goal) {
      // Pre-fill allocation based on goal + risk
      setAllocation(getDefaultAllocation(goal, risk));
    }
    if (step < 4) setStep(step + 1);
  }, [step, goal, risk]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const profile: UserProfile = {
        investment_goal: goal as UserProfile["investment_goal"],
        risk_tolerance: risk,
        time_horizon: horizon as UserProfile["time_horizon"],
        age_range: age as UserProfile["age_range"],
        target_allocation: {
          stocks: allocation.stocks / 100,
          etfs: allocation.etfs / 100,
          bonds: allocation.bonds / 100,
          crypto: allocation.crypto / 100,
        },
        sector_preferences: sectorPrefs,
        sector_exclusions: sectorExclusions,
        monthly_investment: monthly ? parseFloat(monthly) : undefined,
      };
      await profileAPI.save(profile);
      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSector = (sector: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(sector) ? list.filter(s => s !== sector) : [...list, sector]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "hsl(0 0% 4%)" }}>
      <div className="w-full max-w-2xl px-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground">INVESTOR PROFILE</span>
            <span className="text-[10px] tracking-wider text-muted-foreground">STEP {step + 1} / 5</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${((step + 1) / 5) * 100}%`, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Step 0: Goal */}
        {step === 0 && (
          <div>
            <h2 className="section-header mb-6">INVESTMENT GOAL</h2>
            <p className="text-[11px] text-muted-foreground mb-6">What is your primary investment objective?</p>
            <div className="grid grid-cols-2 gap-3">
              {GOALS.map(g => (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className="p-4 text-left transition-all"
                  style={{
                    border: `1px solid ${goal === g.id ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    background: goal === g.id ? "hsl(var(--primary) / 0.08)" : "transparent",
                  }}
                >
                  <div className="text-[11px] font-bold tracking-[0.15em] mb-1" style={{ color: goal === g.id ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                    {g.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Risk */}
        {step === 1 && (
          <div>
            <h2 className="section-header mb-6">RISK TOLERANCE</h2>
            <p className="text-[11px] text-muted-foreground mb-8">How much volatility can you handle?</p>
            <div className="mb-4">
              <input
                type="range"
                min={1}
                max={10}
                value={risk}
                onChange={e => setRisk(parseInt(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[9px] text-muted-foreground">CONSERVATIVE</span>
                <span className="text-[9px] text-muted-foreground">AGGRESSIVE</span>
              </div>
            </div>
            <div className="text-center mt-6">
              <span className="text-3xl font-bold" style={{ color: "hsl(var(--primary))" }}>{risk}</span>
              <span className="text-[10px] text-muted-foreground ml-2">/ 10</span>
              <div className="text-[10px] tracking-[0.15em] text-muted-foreground mt-1">
                {RISK_LABELS[risk]}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Horizon + Age */}
        {step === 2 && (
          <div>
            <h2 className="section-header mb-6">TIME HORIZON</h2>
            <p className="text-[11px] text-muted-foreground mb-4">How long do you plan to invest?</p>
            <div className="flex gap-3 mb-8">
              {HORIZONS.map(h => (
                <button
                  key={h.id}
                  onClick={() => setHorizon(h.id)}
                  className="flex-1 p-3 text-center transition-all"
                  style={{
                    border: `1px solid ${horizon === h.id ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    background: horizon === h.id ? "hsl(var(--primary) / 0.08)" : "transparent",
                  }}
                >
                  <div className="text-[11px] font-bold tracking-[0.15em]" style={{ color: horizon === h.id ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                    {h.label}
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-1">{h.desc}</div>
                </button>
              ))}
            </div>

            <h2 className="section-header mb-4">AGE RANGE</h2>
            <div className="flex gap-3">
              {AGES.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAge(a.id)}
                  className="flex-1 p-3 text-center transition-all"
                  style={{
                    border: `1px solid ${age === a.id ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    background: age === a.id ? "hsl(var(--primary) / 0.08)" : "transparent",
                  }}
                >
                  <div className="text-[11px] font-bold tracking-[0.15em]" style={{ color: age === a.id ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                    {a.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Allocation */}
        {step === 3 && (
          <div>
            <h2 className="section-header mb-6">TARGET ALLOCATION</h2>
            <p className="text-[11px] text-muted-foreground mb-6">
              Set your ideal asset mix. Must total 100%.
              <span className="ml-2" style={{ color: totalAlloc === 100 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}>
                ({totalAlloc}%)
              </span>
            </p>
            {(["stocks", "etfs", "bonds", "crypto"] as const).map(key => (
              <div key={key} className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="label">{key.toUpperCase()}</span>
                  <span className="stat-value">{allocation[key]}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={allocation[key]}
                  onChange={e => setAllocation({ ...allocation, [key]: parseInt(e.target.value) })}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Sectors + Monthly */}
        {step === 4 && (
          <div>
            <h2 className="section-header mb-4">SECTOR PREFERENCES</h2>
            <p className="text-[11px] text-muted-foreground mb-3">Select sectors you want to emphasize (optional)</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {SECTORS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSector(s, sectorPrefs, setSectorPrefs)}
                  className="px-3 py-1.5 text-[10px] tracking-wider transition-all"
                  style={{
                    border: `1px solid ${sectorPrefs.includes(s) ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    background: sectorPrefs.includes(s) ? "hsl(var(--primary) / 0.12)" : "transparent",
                    color: sectorPrefs.includes(s) ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <h2 className="section-header mb-4">SECTOR EXCLUSIONS</h2>
            <p className="text-[11px] text-muted-foreground mb-3">Select sectors to avoid (optional)</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {SECTORS.filter(s => !sectorPrefs.includes(s)).map(s => (
                <button
                  key={s}
                  onClick={() => toggleSector(s, sectorExclusions, setSectorExclusions)}
                  className="px-3 py-1.5 text-[10px] tracking-wider transition-all"
                  style={{
                    border: `1px solid ${sectorExclusions.includes(s) ? "hsl(var(--destructive))" : "hsl(var(--border))"}`,
                    background: sectorExclusions.includes(s) ? "hsl(var(--destructive) / 0.12)" : "transparent",
                    color: sectorExclusions.includes(s) ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <h2 className="section-header mb-3">MONTHLY INVESTMENT</h2>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={monthly}
              onChange={e => setMonthly(e.target.value)}
              className="input-terminal w-full"
            />
            <p className="text-[9px] text-muted-foreground mt-1">Optional — helps calibrate dollar-based recommendations</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            className="btn-terminal flex items-center gap-1"
            disabled={step === 0}
            style={{ opacity: step === 0 ? 0.3 : 1 }}
          >
            <ChevronLeft style={{ width: 12, height: 12 }} /> BACK
          </button>

          {error && <span className="text-[10px]" style={{ color: "hsl(var(--destructive))" }}>{error}</span>}

          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={!canNext()}
              className="btn-terminal-primary flex items-center gap-1"
              style={{ opacity: canNext() ? 1 : 0.4 }}
            >
              NEXT <ChevronRight style={{ width: 12, height: 12 }} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-terminal-primary flex items-center gap-1"
            >
              {submitting ? "SAVING..." : <><Check style={{ width: 12, height: 12 }} /> COMPLETE PROFILE</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
