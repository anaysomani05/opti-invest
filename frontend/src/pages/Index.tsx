import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MarketTicker } from "@/components/MarketTicker/MarketTicker";
import { PortfolioOverview } from "@/components/PortfolioOverview/PortfolioOverview";
import { PortfolioManagement } from "@/components/PortfolioManagement/PortfolioManagement";
import { OnboardingScreen } from "@/components/Onboarding/OnboardingScreen";
import { AdvisorModule } from "@/components/Advisor/AdvisorModule";
import { NewsFeed } from "@/components/NewsFeed/NewsFeed";
import { profileAPI } from "@/lib/api";

const SECTION_TITLES: Record<string, string> = {
  overview: "PORTFOLIO OVERVIEW",
  portfolio: "PORTFOLIO MANAGEMENT",
  advisor: "AI PORTFOLIO ADVISOR",
};

const Index = () => {
  const [activeSection, setActiveSection] = useState("overview");
  const [profileExists, setProfileExists] = useState<boolean | null>(null);

  const checkProfile = useCallback(() => {
    profileAPI.exists().then(r => setProfileExists(r.exists)).catch(() => setProfileExists(false));
  }, []);

  useEffect(() => { checkProfile(); }, [checkProfile]);

  // Show onboarding if no profile
  if (profileExists === false) {
    return <OnboardingScreen onComplete={() => { setProfileExists(true); setActiveSection("overview"); }} />;
  }

  // Loading
  if (profileExists === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground">LOADING...</span>
      </div>
    );
  }

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
            {activeSection === "overview" && <PortfolioOverview />}
            {activeSection === "portfolio" && <PortfolioManagement />}
            {activeSection === "advisor" && (
              <AdvisorModule
                onEditProfile={() => { setProfileExists(false); }}
              />
            )}
          </div>
          {activeSection === "overview" && (
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
