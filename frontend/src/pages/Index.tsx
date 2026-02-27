import { useState } from "react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MarketTicker } from "@/components/MarketTicker/MarketTicker";
import { PortfolioManagement } from "@/components/PortfolioManagement/PortfolioManagement";
import { BacktestConfig } from "@/components/Backtest/BacktestConfig";
import { BacktestResults } from "@/components/Results/BacktestResults";
import { NewsFeed } from "@/components/NewsFeed/NewsFeed";
import type { BacktestResult } from "@/lib/api";

const SECTION_TITLES: Record<string, string> = {
  portfolio: "PORTFOLIO MANAGEMENT",
  backtest: "STRATEGY BACKTESTER",
  results: "BACKTEST RESULTS",
};

const Index = () => {
  const [activeSection, setActiveSection] = useState("portfolio");
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);

  const handleBacktestComplete = (results: BacktestResult[]) => {
    setBacktestResults(results);
    setActiveSection("results");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MarketTicker />
        {/* Page header strip */}
        <div
          className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <span className="text-[10px] tracking-[0.22em] text-muted-foreground font-medium">
            {SECTION_TITLES[activeSection]}
          </span>
          <span className="text-[10px] tracking-wider text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-y-auto min-w-0">
            {activeSection === "portfolio" && <PortfolioManagement />}
            {activeSection === "backtest" && (
              <BacktestConfig onComplete={handleBacktestComplete} />
            )}
            {activeSection === "results" && (
              <BacktestResults
                results={backtestResults}
                onRunNew={() => setActiveSection("backtest")}
              />
            )}
          </div>
          {activeSection === "portfolio" && (
            <div
              className="w-[340px] flex-shrink-0 overflow-hidden flex flex-col"
              style={{ borderLeft: "1px solid hsl(var(--border))" }}
            >
              <NewsFeed />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
