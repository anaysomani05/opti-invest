import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioManagement } from "@/components/PortfolioManagement/PortfolioManagement";
import { SentimentDashboard } from "@/components/SentimentDashboard/SentimentDashboard";
import { OptimizationModule } from "@/components/OptimisationModule/Index";
import { DashboardHeader } from "@/components/Header";
import { PortfolioOverview } from "@/components/PortfolioOverview/PortfolioOverview";

const Index = () => {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      
      <main className="container mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
            <TabsTrigger value="optimization">Optimization</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <PortfolioOverview />
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-6">
            <PortfolioManagement />
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-6">
            <SentimentDashboard />
          </TabsContent>

          <TabsContent value="optimization" className="space-y-6">
            <OptimizationModule onNavigateToPortfolio={() => setActiveTab("portfolio")} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;