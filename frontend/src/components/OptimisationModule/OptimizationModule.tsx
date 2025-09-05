import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Shield, Zap, BarChart3, PieChart, Calculator, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useToast } from "@/hooks/use-toast";
import "./OptimizationModule.css";
import { 
  portfolioAPI, 
  optimizationAPI, 
  type OptimizationRequest, 
  type OptimizationResult, 
  type RiskProfile,
  type ValidationResult,
  type EfficientFrontierPoint,
  type HoldingWithMetrics
} from "@/lib/api";

interface OptimizationModuleProps {
  onNavigateToPortfolio?: () => void;
}

export const OptimizationModule = ({ onNavigateToPortfolio }: OptimizationModuleProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [riskProfile, setRiskProfile] = useState("moderate");
  const [activeTab, setActiveTab] = useState("comparison");

  // REUSE HOLDINGS DATA FROM PORTFOLIO PAGE (no additional API calls!)
  const { data: holdings = [], isLoading: holdingsLoading, error: holdingsError } = useQuery<HoldingWithMetrics[]>({
    queryKey: ['holdings-with-metrics'],
    queryFn: portfolioAPI.getHoldingsWithMetrics,
    refetchInterval: false, // Disable auto-refresh to save API calls
    staleTime: 10 * 60 * 1000, // Consider data fresh for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes (renamed from cacheTime)
    retry: false, // Don't retry on failure
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // CALCULATE CURRENT PORTFOLIO WEIGHTS FROM REAL DATA
  const currentPortfolio = useMemo(() => {
    if (!holdings.length) return {};
    
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const weights: Record<string, number> = {};
    
    holdings.forEach(holding => {
      weights[holding.symbol] = (holding.value / totalValue) * 100;
    });
    
    return weights;
  }, [holdings]);

  // GET RISK PROFILES FROM BACKEND
  const { data: riskProfiles = [], isLoading: riskProfilesLoading, error: riskProfilesError } = useQuery({
    queryKey: ['risk-profiles'],
    queryFn: optimizationAPI.getRiskProfiles,
    retry: false, // Don't retry on failure
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // VALIDATE PORTFOLIO FOR OPTIMIZATION (disabled to save API calls)
  const validation = useMemo(() => {
    if (!holdings.length) return null;
    return {
      is_valid: holdings.length >= 3,
      issues: holdings.length < 3 ? ["Need at least 3 holdings for optimization"] : [],
      suggestions: holdings.length < 3 ? ["Add more holdings to diversify your portfolio"] : [],
      portfolio_summary: {
        total_value: holdings.reduce((sum, holding) => sum + holding.value, 0),
        holdings_count: holdings.length,
        symbols: holdings.map(h => h.symbol)
      }
    };
  }, [holdings]);

  // OPTIMIZATION MUTATION
  const optimizationMutation = useMutation({
    mutationFn: async (request: OptimizationRequest) => {
      return optimizationAPI.optimizePortfolio(request);
    },
    onSuccess: (result) => {
      toast({
        title: "Optimization Complete!",
        description: `Portfolio optimized with Sharpe ratio of ${result.sharpe_ratio.toFixed(2)}`,
      });
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['optimization-results'] });
    },
    onError: (error: any) => {
      toast({
        title: "Optimization Failed",
        description: error.message || "Failed to optimize portfolio. Please try again.",
        variant: "destructive",
      });
    },
  });

  // GET EFFICIENT FRONTIER DATA from optimization result
  const efficientFrontier = optimizationMutation.data?.efficient_frontier || [];
  const frontierLoading = optimizationMutation.isPending;

  const handleOptimize = async () => {
    if (!holdings.length) {
      toast({
        title: "No Holdings Found",
        description: "Please add some holdings to your portfolio before optimizing.",
        variant: "destructive",
      });
      return;
    }

    // Extract current prices from holdings to avoid duplicate API calls
    const currentPrices: Record<string, number> = {};
    holdings.forEach(holding => {
      currentPrices[holding.symbol] = holding.current_price;
    });

    const request: OptimizationRequest = {
      risk_profile: riskProfile,
      objective: "max_sharpe",
      lookback_period: 252, // 1 year of trading days
      current_prices: currentPrices, // Send current prices to avoid API calls
    };

    optimizationMutation.mutate(request);
  };

  const getColorForChange = (current: number, optimized: number) => {
    const diff = optimized - current;
    if (Math.abs(diff) < 1) return "text-muted-foreground";
    return diff > 0 ? "text-success" : "text-destructive";
  };

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const totalGainLoss = holdings.reduce((sum, holding) => sum + holding.gain_loss, 0);
    const totalCostBasis = totalValue - totalGainLoss;
    const totalReturnPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
    
    return {
      totalValue,
      totalGainLoss,
      totalCostBasis,
      totalReturnPercent
    };
  }, [holdings]);

  // Backend connection error - show preview of what optimization will look like
  if (holdingsError || riskProfilesError) {
    return (
      <div className="space-y-6">
        {/* Preview of what optimization will look like */}
        <div className="optimization-container" style={{ opacity: 0.6 }}>

          {/* Risk Profile Selection Preview */}
          <div className="optimization-card">
            <div className="optimization-card-header">
              <div className="optimization-card-title">Risk Profile Selection</div>
            </div>
            <div className="optimization-card-content">
              <div className="optimization-grid-3">
                {[
                  { id: "conservative", name: "Conservative", icon: Shield, description: "Low risk, stable returns" },
                  { id: "moderate", name: "Moderate", icon: BarChart3, description: "Balanced risk and return" },
                  { id: "aggressive", name: "Aggressive", icon: Zap, description: "High risk, high potential returns" }
                ].map((profile) => {
                  const IconComponent = profile.icon;
                  return (
                    <div key={profile.id} className="optimization-radio-item">
                      <div className="optimization-radio-label">
                        <IconComponent className="optimization-radio-icon" />
                        <div className="optimization-radio-content">
                          <div className="optimization-radio-name">{profile.name}</div>
                          <div className="optimization-radio-description">
                            {profile.description}
                          </div>
                          <div className="optimization-radio-details">
                            <div>Return: 8-12%</div>
                            <div>Volatility: ≤20%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '1.5rem' }}>
                <button disabled className="optimization-button optimization-button-full">
                  <Calculator className="optimization-button-icon" />
                  Optimize Portfolio
                </button>
              </div>
            </div>
          </div>

          {/* Optimization Results Preview */}
          <div className="optimization-grid-4">
            {[
              { title: "Expected Return", icon: TrendingUp },
              { title: "Volatility", icon: BarChart3 },
              { title: "Sharpe Ratio", icon: TrendingUp },
              { title: "CVaR (95%)", icon: Shield }
            ].map((metric) => (
              <div key={metric.title} className="optimization-metric-card">
                <div className="optimization-metric-header">
                  <div className="optimization-metric-title">{metric.title}</div>
                  <metric.icon className="optimization-metric-icon" />
                </div>
                <div className="optimization-metric-content">
                  <div className="optimization-metric-value" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    --
                  </div>
                  <p className="optimization-metric-description">
                    {metric.title === "Expected Return" && "Annual expected return"}
                    {metric.title === "Volatility" && "Annual volatility"}
                    {metric.title === "Sharpe Ratio" && "Risk-adjusted return"}
                    {metric.title === "CVaR (95%)" && "Conditional Value at Risk"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Portfolio Optimization Features Preview */}
          <div className="optimization-card">
            <div className="optimization-card-header">
              <div className="optimization-card-title">Portfolio Optimization Features</div>
            </div>
            <div className="optimization-card-content">
              {/* Empty content area */}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Loading states - only show when actually loading (not when backend is down)
  if (holdingsLoading || riskProfilesLoading) {
    return (
      <div className="optimization-loading">
        <Loader2 className="optimization-loading-icon" />
        <span className="optimization-loading-text">Loading optimization data...</span>
      </div>
    );
  }

  return (
    <div className="optimization-container">
      {/* Portfolio Validation Status - Only show errors */}
      {validation && !validation.is_valid && (
        <div className="optimization-alert">
          <AlertTriangle className="optimization-alert-icon" />
          <div className="optimization-alert-content">
            <div>
              <div className="optimization-alert-title">Portfolio validation issues:</div>
              <ul className="optimization-alert-list">
                {validation.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Risk Profile Selection */}
      <div className="optimization-card">
        <div className="optimization-card-header">
          <div className="optimization-card-title">Risk Profile Selection</div>
        </div>
        <div className="optimization-card-content">
          <div className="optimization-radio-group" role="radiogroup">
            <div className="optimization-grid-3">
              {riskProfiles.map((profile) => {
                const IconComponent = profile.id === "conservative" ? Shield : 
                                    profile.id === "moderate" ? BarChart3 : Zap;
                return (
                  <div key={profile.id} className="optimization-radio-item">
                    <input
                      type="radio"
                      value={profile.id}
                      id={profile.id}
                      name="riskProfile"
                      checked={riskProfile === profile.id}
                      onChange={(e) => setRiskProfile(e.target.value)}
                      className="optimization-radio-input"
                    />
                    <label
                      htmlFor={profile.id}
                      className={`optimization-radio-label ${riskProfile === profile.id ? 'checked' : ''}`}
                    >
                      <IconComponent className="optimization-radio-icon" />
                      <div className="optimization-radio-content">
                        <div className="optimization-radio-name">{profile.name}</div>
                        <div className="optimization-radio-description">
                          {profile.description}
                        </div>
                        <div className="optimization-radio-details">
                          <div>Return: {(profile.target_return * 100).toFixed(0)}-{((profile.target_return + 0.04) * 100).toFixed(0)}%</div>
                          <div>Volatility: ≤{(profile.max_volatility * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <button 
              onClick={handleOptimize} 
              disabled={optimizationMutation.isPending || !holdings.length} 
              className={`optimization-button ${!holdings.length ? 'optimization-button-full' : 'optimization-button-auto'}`}
            >
              {optimizationMutation.isPending ? (
                <>
                  <Loader2 className="optimization-button-spinner" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Calculator className="optimization-button-icon" />
                  Optimize Portfolio
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Optimization Results */}
      {optimizationMutation.data && (
        <div className="optimization-grid-4">
          <div className="optimization-metric-card">
            <div className="optimization-metric-header">
              <div className="optimization-metric-title">Expected Return</div>
              <TrendingUp className="optimization-metric-icon" />
            </div>
            <div className="optimization-metric-content">
              <div className="optimization-metric-value optimization-metric-value-success">
                {(optimizationMutation.data.expected_return * 100).toFixed(1)}%
              </div>
              <p className="optimization-metric-description">Annual expected return</p>
            </div>
          </div>

          <div className="optimization-metric-card">
            <div className="optimization-metric-header">
              <div className="optimization-metric-title">Volatility</div>
              <BarChart3 className="optimization-metric-icon" />
            </div>
            <div className="optimization-metric-content">
              <div className="optimization-metric-value">
                {(optimizationMutation.data.volatility * 100).toFixed(1)}%
              </div>
              <p className="optimization-metric-description">Annual volatility</p>
            </div>
          </div>

          <div className="optimization-metric-card">
            <div className="optimization-metric-header">
              <div className="optimization-metric-title">Sharpe Ratio</div>
              <TrendingUp className="optimization-metric-icon" />
            </div>
            <div className="optimization-metric-content">
              <div className="optimization-metric-value optimization-metric-value-primary">
                {optimizationMutation.data.sharpe_ratio.toFixed(2)}
              </div>
              <p className="optimization-metric-description">Risk-adjusted return</p>
            </div>
          </div>

          <div className="optimization-metric-card">
            <div className="optimization-metric-header">
              <div className="optimization-metric-title">CVaR (95%)</div>
              <Shield className="optimization-metric-icon" />
            </div>
            <div className="optimization-metric-content">
              <div className="optimization-metric-value optimization-metric-value-warning">
                {optimizationMutation.data.cvar ? (optimizationMutation.data.cvar * 100).toFixed(1) : 'N/A'}%
              </div>
              <p className="optimization-metric-description">Conditional Value at Risk</p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Comparison */}
      {optimizationMutation.data && (
        <div className="optimization-tabs">
          <div className="optimization-tabs-list">
            <button 
              className={`optimization-tabs-trigger ${activeTab === "comparison" ? "active" : ""}`}
              onClick={() => setActiveTab("comparison")}
            >
              Allocation Comparison
            </button>
            <button 
              className={`optimization-tabs-trigger ${activeTab === "rebalancing" ? "active" : ""}`}
              onClick={() => setActiveTab("rebalancing")}
            >
              Rebalancing Trades
            </button>
            <button 
              className={`optimization-tabs-trigger ${activeTab === "efficient-frontier" ? "active" : ""}`}
              onClick={() => setActiveTab("efficient-frontier")}
            >
              Efficient Frontier
            </button>
            <button 
              className={`optimization-tabs-trigger ${activeTab === "metrics" ? "active" : ""}`}
              onClick={() => setActiveTab("metrics")}
            >
              Detailed Metrics
            </button>
          </div>

          {activeTab === "comparison" && (
            <div className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <PieChart className="mr-2 h-5 w-5" />
                      Current Allocation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(currentPortfolio).map(([ticker, weight]) => (
                      <div key={ticker} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{ticker}</span>
                          <span>{weight.toFixed(1)}%</span>
                        </div>
                        <Progress value={weight} className="h-2" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="mr-2 h-5 w-5" />
                      Optimized Allocation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(optimizationMutation.data.optimal_weights).map(([ticker, weight]) => {
                      const currentWeight = currentPortfolio[ticker] || 0;
                      const diff = (weight * 100) - currentWeight;
                      return (
                        <div key={ticker} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{ticker}</span>
                            <div className="flex items-center space-x-2">
                              <span>{(weight * 100).toFixed(1)}%</span>
                              <Badge
                                variant={diff > 1 ? "default" : diff < -1 ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                              </Badge>
                            </div>
                          </div>
                          <Progress value={weight * 100} className="h-2" />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "rebalancing" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calculator className="mr-2 h-5 w-5" />
                    Rebalancing Trades Required
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(optimizationMutation.data.rebalancing_trades).map(([symbol, amount]) => {
                      const isBuy = amount > 0;
                      const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
                      const percentage = (Math.abs(amount) / totalValue) * 100;
                      
                      return (
                        <div key={symbol} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Badge variant={isBuy ? "default" : "destructive"}>
                              {isBuy ? "BUY" : "SELL"}
                            </Badge>
                            <span className="font-medium">{symbol}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">
                              {isBuy ? "+" : "-"}${Math.abs(amount).toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {percentage.toFixed(1)}% of portfolio
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "efficient-frontier" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Efficient Frontier Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  {frontierLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Loading efficient frontier...</span>
                    </div>
                  ) : efficientFrontier.length > 0 ? (
                    <div className="w-full">
                      <div className="h-80 w-full mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart
                            margin={{
                              top: 30,
                              right: 30,
                              bottom: 60,
                              left: 60,
                            }}
                          >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            type="number" 
                            dataKey="volatility" 
                            name="Volatility"
                            label={{ value: 'Volatility (Risk)', position: 'insideBottom', offset: -10 }}
                            domain={['dataMin - 0.01', 'dataMax + 0.01']}
                            tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            type="number" 
                            dataKey="expected_return" 
                            name="Expected Return"
                            label={{ value: 'Expected Return', angle: -90, position: 'insideLeft', offset: -15, style: { textAnchor: 'middle' } }}
                            domain={['dataMin - 0.01', 'dataMax + 0.01']}
                            tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                                    <div className="space-y-2">
                                      <div className="font-semibold text-sm border-b border-border pb-1">
                                        Portfolio Point Details
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <span className="text-muted-foreground">Expected Return:</span>
                                          <div className="font-medium text-green-600">
                                            {(data.expected_return * 100).toFixed(2)}%
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Volatility:</span>
                                          <div className="font-medium text-orange-600">
                                            {(data.volatility * 100).toFixed(2)}%
                                          </div>
                                        </div>
                                        <div className="col-span-2">
                                          <span className="text-muted-foreground">Sharpe Ratio:</span>
                                          <div className="font-medium text-blue-600">
                                            {data.sharpe_ratio.toFixed(3)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Scatter 
                            name="Efficient Frontier" 
                            data={efficientFrontier.map(point => ({
                              volatility: point.volatility,
                              expected_return: point.expected_return,
                              sharpe_ratio: point.sharpe_ratio,
                              weights: point.weights
                            }))}
                            fill="#8884d8"
                          >
                            {efficientFrontier.map((entry, index) => {
                              const maxSharpe = Math.max(...efficientFrontier.map(p => p.sharpe_ratio));
                              const isOptimal = Math.abs(entry.sharpe_ratio - maxSharpe) < 0.001;
                              return (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={isOptimal ? "#ff6b6b" : "#8884d8"} 
                                />
                              );
                            })}
                          </Scatter>
                        </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Legend and Information */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span className="text-muted-foreground">Efficient Frontier Points ({efficientFrontier.length} points)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            <span className="text-muted-foreground">Optimal Portfolio (Max Sharpe)</span>
                          </div>
                        </div>
                        
                        {efficientFrontier.length > 0 && (
                          <div className="text-center">
                            <div className="inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-xs text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
                              <div className="flex items-center gap-1">
                                <span className="font-medium">Return Range:</span>
                                <span>{(Math.min(...efficientFrontier.map(p => p.expected_return)) * 100).toFixed(1)}% - {(Math.max(...efficientFrontier.map(p => p.expected_return)) * 100).toFixed(1)}%</span>
                              </div>
                              <div className="hidden sm:block text-muted-foreground/50">|</div>
                              <div className="flex items-center gap-1">
                                <span className="font-medium">Risk Range:</span>
                                <span>{(Math.min(...efficientFrontier.map(p => p.volatility)) * 100).toFixed(1)}% - {(Math.max(...efficientFrontier.map(p => p.volatility)) * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-lg">
                      <div className="text-center text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-2" />
                        <p>Run optimization to generate efficient frontier</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "metrics" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Current Portfolio Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Value</span>
                      <span className="font-medium">
                        ${portfolioMetrics.totalValue.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Holdings Count</span>
                      <span className="font-medium">{holdings.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Gain/Loss</span>
                      <span className={`font-medium ${portfolioMetrics.totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
                        ${portfolioMetrics.totalGainLoss.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Return</span>
                      <span className={`font-medium ${portfolioMetrics.totalReturnPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {portfolioMetrics.totalReturnPercent.toFixed(2)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Optimized Portfolio Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected Return</span>
                      <span className="font-medium text-success">
                        {(optimizationMutation.data.expected_return * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Volatility</span>
                      <span className="font-medium text-success">
                        {(optimizationMutation.data.volatility * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sharpe Ratio</span>
                      <span className="font-medium text-success">
                        {optimizationMutation.data.sharpe_ratio.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CVaR (95%)</span>
                      <span className="font-medium text-success">
                        {optimizationMutation.data.cvar ? (optimizationMutation.data.cvar * 100).toFixed(1) : 'N/A'}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Drawdown</span>
                      <span className="font-medium text-success">
                        {optimizationMutation.data.max_drawdown ? (optimizationMutation.data.max_drawdown * 100).toFixed(1) : 'N/A'}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Holdings Message */}
      {!holdings.length && (
        <div className="optimization-empty-card">
          <div className="optimization-empty-content">
            <PieChart className="optimization-empty-icon" />
            <h3 className="optimization-empty-title">No Holdings Found</h3>
            <p className="optimization-empty-description">
              Add some holdings to your portfolio to start optimizing
            </p>
            <button onClick={onNavigateToPortfolio} className="optimization-empty-button">
              Go to Portfolio Management
            </button>
          </div>
        </div>
      )}
    </div>
  );
};