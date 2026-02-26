import { useState } from "react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { PortfolioOverview } from "@/components/PortfolioOverview/PortfolioOverview";
import { PortfolioManagement } from "@/components/PortfolioManagement/PortfolioManagement";
import { SentimentDashboard } from "@/components/SentimentDashboard/SentimentDashboard";
import { OptimizationModule } from "@/components/OptimisationModule/Index";
import { IntelligenceDashboard } from "@/components/Intelligence/IntelligenceDashboard";

const SECTION_TITLES: Record<string, string> = {
  overview: "PORTFOLIO OVERVIEW",
  portfolio: "PORTFOLIO MANAGEMENT",
  sentiment: "SENTIMENT ANALYSIS",
  optimization: "PORTFOLIO OPTIMIZATION",
  intelligence: "AI SIGNALS & INTELLIGENCE",
};

const Index = () => {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
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
        <div className="flex-1 overflow-y-auto">
          {activeSection === "overview" && <PortfolioOverview />}
          {activeSection === "portfolio" && <PortfolioManagement />}
          {activeSection === "sentiment" && <SentimentDashboard />}
          {activeSection === "optimization" && (
            <OptimizationModule
              onNavigateToPortfolio={() => setActiveSection("portfolio")}
            />
          )}
          {activeSection === "intelligence" && (
            <IntelligenceDashboard
              onNavigateToPortfolio={() => setActiveSection("portfolio")}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
