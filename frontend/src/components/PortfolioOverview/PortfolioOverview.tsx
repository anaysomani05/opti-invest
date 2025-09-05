import { useQuery } from "@tanstack/react-query";
import "./PortfolioOverview.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, PieChart, Activity } from "lucide-react";
import { portfolioAPI, type PortfolioOverview as PortfolioOverviewType } from "@/lib/api";

export const PortfolioOverview = () => {
  // Fetch portfolio overview data
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio-overview'],
    queryFn: portfolioAPI.getOverview,
    refetchInterval: 30000, // Refetch every 30 seconds for updated prices
  });

  // Use default values if no data is available
  const summary = portfolioData?.summary || {
    total_value: 0,
    total_gain_loss: 0,
    total_gain_loss_percent: 0,
    holdings_count: 0
  };
  const holdings = portfolioData?.holdings || [];
  const sector_allocation = portfolioData?.sector_allocation || {};
  
  const portfolioValue = summary.total_value;
  const totalGainLoss = summary.total_gain_loss;
  const totalGainLossPercent = summary.total_gain_loss_percent;

  // Calculate top holdings by value
  const topHoldings = holdings
    .map(holding => ({
      symbol: holding.symbol,
      name: `${holding.symbol} Inc.`, // Mock company name
      allocation: holding.current_price && portfolioValue > 0 
        ? (holding.quantity * holding.current_price / portfolioValue) * 100 
        : 0,
      value: holding.current_price ? holding.quantity * holding.current_price : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Convert sector allocation to expected format
  const sectorAllocation = sector_allocation 
    ? Object.entries(sector_allocation).map(([sector, allocation], index) => ({
        sector,
        allocation,
        color: `bg-chart-${(index % 5) + 1}`,
      }))
    : [];

  return (
    <div className="po-grid">
      {/* Portfolio Value */}
      <Card>
        <CardHeader className="po-card-header">
          <CardTitle className="po-title-sm">Portfolio Value</CardTitle>
          <DollarSign className="h-4 w-4 po-muted po-icon" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${portfolioValue.toLocaleString()}</div>
          <div className="text-xs po-muted">
            <span className={totalGainLossPercent >= 0 ? "text-success" : "text-destructive"}>
              ${Math.abs(totalGainLoss).toLocaleString()} ({Math.abs(totalGainLossPercent).toFixed(2)}%)
            </span>
            <span className="ml-1">total return</span>
          </div>
        </CardContent>
      </Card>

      {/* Total Return */}
      <Card>
        <CardHeader className="po-card-header">
          <CardTitle className="po-title-sm">Total Return</CardTitle>
          <BarChart3 className="h-4 w-4 po-muted po-icon" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
            {totalGainLoss >= 0 ? '+' : ''}${totalGainLoss.toLocaleString()}
          </div>
          <div className={`text-xs ${totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
            {totalGainLoss >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}% total
          </div>
        </CardContent>
      </Card>

      {/* Sharpe Ratio */}
      <Card>
        <CardHeader className="po-card-header">
          <CardTitle className="po-title-sm">Sharpe Ratio</CardTitle>
          <Activity className="h-4 w-4 po-muted po-icon" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {holdings.length > 0 ? '1.47' : 'N/A'}
          </div>
          <div className="text-xs text-muted-foreground">
            Risk-adjusted return
          </div>
        </CardContent>
      </Card>

      {/* Diversification Score */}
      <Card>
        <CardHeader className="po-card-header">
          <CardTitle className="po-title-sm">Diversification</CardTitle>
          <PieChart className="h-4 w-4 po-muted po-icon" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {holdings.length > 0 ? `${summary.holdings_count}` : '0'}
          </div>
          <div className="text-xs text-muted-foreground">
            Total holdings
          </div>
        </CardContent>
      </Card>

      {/* Top Holdings */}
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <CardTitle className="po-title-lg">Top Holdings</CardTitle>
        </CardHeader>
        <CardContent className="po-gap-4">
          {topHoldings.map((holding) => (
            <div key={holding.symbol} className="po-flex-between">
              <div className="flex-1">
                <div className="po-flex-between po-mb-1">
                  <div className="flex items-center po-gap-2">
                    <span className="font-medium">{holding.symbol}</span>
                    <span className="text-sm po-muted">{holding.name}</span>
                  </div>
                  <div className="flex items-center po-gap-2">
                    <span className="text-sm font-medium">${holding.value.toLocaleString()}</span>
                  </div>
                </div>
                <Progress value={holding.allocation} className="po-progress-sm" />
                <div className="text-xs po-muted po-mt-1">
                  {holding.allocation.toFixed(1)}% of portfolio
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sector Allocation */}
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <CardTitle className="po-title-lg">Sector Allocation</CardTitle>
        </CardHeader>
        <CardContent className="po-gap-3" style={{ paddingLeft: '0.75rem' }}>
          {sectorAllocation.map((sector) => (
            <div key={sector.sector} className="flex items-center gap-1">
              <div className="flex items-center gap-1" style={{ width: '200px' }}>
                <div className={`w-3 h-3 rounded-full ${sector.color}`}></div>
                <span className="text-sm font-medium whitespace-nowrap">{sector.sector}</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Progress value={sector.allocation} className="h-2 flex-1" />
                <span className="text-sm po-muted" style={{ minWidth: '45px' }}>
                  {sector.allocation.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};