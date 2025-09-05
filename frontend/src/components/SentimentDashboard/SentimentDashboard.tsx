import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Twitter, MessageSquare, Globe, RefreshCw } from "lucide-react";
import { sentimentAPI, SentimentData, SentimentAlert, CorrelationData } from "@/lib/api";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ScatterChart, Scatter } from "recharts";
import "./SentimentDashboard.css";

export const SentimentDashboard = () => {
  const [selectedTicker, setSelectedTicker] = useState("");
  const [timeRange, setTimeRange] = useState("1d");
  const [sentimentData, setSentimentData] = useState<SentimentData[]>([]);
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [loading, setLoading] = useState(false); // Start with false - no auto loading
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedData, setHasLoadedData] = useState(false); // Track if user has loaded data
  const [correlationData, setCorrelationData] = useState<CorrelationData[]>([]);
  const [selectedStockForCorrelation, setSelectedStockForCorrelation] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");

  // This function is not used anymore - we use handleLoadData instead

  // Load data for selected stock
  const handleLoadData = async () => {
    if (!isValidTicker) {
      setError('Please enter a valid stock ticker');
      return;
    }

    try {
      console.log(`Loading sentiment data for ${selectedTicker}...`);
      console.log(`User entered ticker: "${selectedTicker}"`);
      setLoading(true);
      setError(null);

      console.log(`Calling sentiment API for: ${selectedTicker}`);
      const stockData = await sentimentAPI.getSentiment(selectedTicker);

      console.log(`Sentiment data received for ${selectedTicker}:`, stockData);
      
      // Add to existing stocks instead of replacing
      setSentimentData(prevData => {
        // Check if this stock is already in the list
        const existingIndex = prevData.findIndex(item => item.symbol === stockData.symbol);
        
        if (existingIndex >= 0) {
          // Replace existing stock data
          const updatedData = [...prevData];
          updatedData[existingIndex] = stockData;
          return updatedData;
        } else {
          // Add new stock to the right
          return [...prevData, stockData];
        }
      });
      
      setAlerts([]); // Clear alerts
      setHasLoadedData(true);
      
      // Clear the input field for next stock
      setSelectedTicker("");
    } catch (err) {
      console.error('Sentiment fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sentiment data';

      // Provide user-friendly error messages
      if (errorMessage.includes('404')) {
        setError(`Stock ticker "${selectedTicker}" not found. Please check the ticker symbol.`);
      } else if (errorMessage.includes('429')) {
        setError('API rate limit exceeded. Please try again in a few minutes.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
      console.log('Sentiment load completed');
    }
  };


  // Load correlation data for a specific stock
  const handleLoadCorrelation = async (symbol: string) => {
    try {
      setSelectedStockForCorrelation(symbol);
      const correlation = await sentimentAPI.getCorrelation(symbol);
      setCorrelationData(prev => {
        const existingIndex = prev.findIndex(item => item.symbol === symbol);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = correlation;
          return updated;
        } else {
          return [...prev, correlation];
        }
      });
    } catch (err) {
      console.error('Failed to load correlation data:', err);
    }
  };

  // Clear all loaded stocks
  const handleClearAll = () => {
    setSentimentData([]);
    setAlerts([]);
    setCorrelationData([]);
    setSelectedStockForCorrelation("");
    setHasLoadedData(false);
    setSelectedTicker("");
    setError(null);
  };

  // Refresh all loaded stocks
  const handleRefreshAll = async () => {
    if (!hasLoadedData || sentimentData.length === 0) {
      return;
    }

    try {
      setLoading(true);
      await sentimentAPI.refreshCache();
      
      // Refresh all loaded stocks
      const refreshedData = [];
      for (const stock of sentimentData) {
        try {
          const updatedStock = await sentimentAPI.getSentiment(stock.symbol);
          refreshedData.push(updatedStock);
        } catch (err) {
          console.error(`Failed to refresh ${stock.symbol}:`, err);
          refreshedData.push(stock); // Keep old data if refresh fails
        }
      }
      
      setSentimentData(refreshedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  // Load correlation data for all loaded stocks
  const loadCorrelationData = async () => {
    if (!hasLoadedData || sentimentData.length === 0) {
      return;
    }

    try {
      const correlations = [];
      for (const stock of sentimentData) {
        try {
          const correlation = await sentimentAPI.getCorrelation(stock.symbol);
          correlations.push(correlation);
        } catch (err) {
          console.error(`Failed to get correlation for ${stock.symbol}:`, err);
        }
      }
      setCorrelationData(correlations);
    } catch (err) {
      console.error('Error loading correlation data:', err);
    }
  };

  // Load correlation data when sentiment data changes
  useEffect(() => {
    if (hasLoadedData && sentimentData.length > 0) {
      loadCorrelationData();
    }
  }, [sentimentData, hasLoadedData]);

  const getSentimentColor = (sentiment: number) => {
    if (sentiment >= 0.7) return "text-success";
    if (sentiment >= 0.5) return "text-warning";
    return "text-destructive";
  };

  const getSentimentBadge = (sentiment: number) => {
    if (sentiment >= 0.7) return { label: "Positive", variant: "default" as const };
    if (sentiment >= 0.5) return { label: "Neutral", variant: "secondary" as const };
    return { label: "Negative", variant: "destructive" as const };
  };

  // Transform API data to match UI expectations
  // Validate ticker input
  const isValidTicker = selectedTicker.trim().length > 0 && selectedTicker.trim().length <= 10;

  const transformedData = sentimentData.map(item => ({
    ticker: item.symbol,
    sentiment: item.overall_sentiment,
    price: item.price || 0,
    priceChange: item.price_change || 0,
    volume: item.volume || 0,
    mentions: item.total_mentions,
    sources: item.sources
  }));


  return (
    <div className="sentiment-container">
      {/* Controls */}
      <div className="sentiment-card">
        <div className="sentiment-card-header">
          <div className="sentiment-controls-header">
            <div className="sentiment-card-title">Sentiment Analysis Controls</div>
            {hasLoadedData && (
              <div className="sentiment-controls-info">
                <span className="sentiment-controls-count">
                  {sentimentData.length} stock{sentimentData.length !== 1 ? 's' : ''} loaded
                </span>
                <button className="sentiment-controls-button sentiment-controls-button-sm" onClick={handleClearAll}>
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="sentiment-card-content">
          <div className="sentiment-grid-3">
            <div className="sentiment-form-group">
              <label className="sentiment-label">Stock Ticker</label>
              <input
                type="text"
                placeholder="Enter stock ticker (e.g., AAPL, TSLA, NVDA)"
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
                className={`sentiment-input ${!isValidTicker && selectedTicker.length > 0 ? 'sentiment-input-error' : ''}`}
              />
              {!isValidTicker && selectedTicker.length > 0 && (
                <p className="sentiment-error-text">Please enter a valid ticker symbol</p>
              )}
            </div>
            
            <div className="sentiment-form-group">
              <label className="sentiment-label">Time Range</label>
              <div className="sentiment-select">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="sentiment-select-trigger"
                >
                  <option value="1d">1 Day</option>
                  <option value="1w">1 Week</option>
                  <option value="1m">1 Month</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button
                className="sentiment-button sentiment-button-full"
                onClick={handleLoadData}
                disabled={loading || !isValidTicker}
              >
                <Activity className={`sentiment-button-icon ${loading ? 'sentiment-button-spinner' : ''}`} />
                {loading ? 'Loading...' : 'Load Sentiment Data'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="sentiment-error-card">
          <div className="sentiment-error-content">
            <div className="sentiment-error-message">
              <AlertTriangle className="sentiment-error-icon" />
              <p className="sentiment-error-text">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Initial Message */}
      {!hasLoadedData && !loading && !error && (
        <div className="sentiment-empty-card">
          <div className="sentiment-empty-content">
            <div className="sentiment-empty-center">
              <Activity className="sentiment-empty-icon" />
              <div>
                <h3 className="sentiment-empty-title">Enter a stock ticker and load sentiment data</h3>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Show tabs only when data is loaded */}
      {hasLoadedData && transformedData.length > 0 && (
        <div className="sentiment-tabs">
          <div className="sentiment-tabs-header">
            <div className="sentiment-tabs-list">
              <button 
                className={`sentiment-tabs-trigger ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button 
                className={`sentiment-tabs-trigger ${activeTab === 'correlation' ? 'active' : ''}`}
                onClick={() => setActiveTab('correlation')}
              >
                Price Correlation
              </button>
              <button 
                className={`sentiment-tabs-trigger ${activeTab === 'heatmap' ? 'active' : ''}`}
                onClick={() => setActiveTab('heatmap')}
              >
                Sentiment Heatmap
              </button>
            </div>
            <button className="sentiment-controls-button sentiment-controls-button-sm" onClick={handleRefreshAll} disabled={loading || sentimentData.length === 0}>
              <RefreshCw className={`sentiment-button-icon ${loading ? 'sentiment-button-spinner' : ''}`} />
              Refresh All
            </button>
          </div>

          <div className="sentiment-tabs-content">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="sentiment-grid-3-lg">
                {transformedData.map(stock => {
                  const badge = getSentimentBadge(stock.sentiment);
                  return (
                    <div key={stock.ticker} className={`sentiment-stock-card ${selectedTicker === stock.ticker ? 'selected' : ''}`}>
                      <div className="sentiment-stock-header">
                        <div className="sentiment-stock-title">{stock.ticker}</div>
                        <span className={`sentiment-badge ${
                          badge.variant === 'default' ? 'sentiment-badge-default' :
                          badge.variant === 'secondary' ? 'sentiment-badge-secondary' :
                          'sentiment-badge-destructive'
                        }`}>{badge.label}</span>
                      </div>
                      <div className="sentiment-stock-content">
                        <div className="sentiment-stock-main">
                          <div className="sentiment-stock-price">
                            <div className="sentiment-stock-price-value">${stock.price.toFixed(2)}</div>
                            <div className={`sentiment-stock-price-change ${stock.priceChange >= 0 ? 'sentiment-stock-price-change-success' : 'sentiment-stock-price-change-destructive'}`}>
                              {stock.priceChange >= 0 ? (
                                <TrendingUp className="sentiment-stock-price-icon" />
                              ) : (
                                <TrendingDown className="sentiment-stock-price-icon" />
                              )}
                              {stock.priceChange >= 0 ? '+' : ''}{stock.priceChange}%
                            </div>
                          </div>
                          <div className="sentiment-stock-sentiment">
                            <div className={`sentiment-stock-sentiment-value ${
                              stock.sentiment >= 0.7 ? 'sentiment-stock-sentiment-value-success' :
                              stock.sentiment >= 0.5 ? 'sentiment-stock-sentiment-value-warning' :
                              'sentiment-stock-sentiment-value-destructive'
                            }`}>
                              {(stock.sentiment * 100).toFixed(0)}%
                            </div>
                            <div className="sentiment-stock-sentiment-label">sentiment</div>
                          </div>
                        </div>

                        <div className="sentiment-stock-details">
                          <div className="sentiment-stock-detail-row">
                            <span className="sentiment-stock-detail-label">Mentions</span>
                            <span>{stock.mentions.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Price Correlation Tab */}
            {activeTab === 'correlation' && (
              <div className="sentiment-correlation-card">
                <div className="sentiment-correlation-header">
                  <div className="sentiment-correlation-title">Price vs Sentiment Correlation</div>
                  <div className="sentiment-correlation-buttons">
                    {transformedData.map(stock => (
                      <button
                        key={stock.ticker}
                        className={`sentiment-correlation-button ${selectedStockForCorrelation === stock.ticker ? 'active' : ''}`}
                        onClick={() => handleLoadCorrelation(stock.ticker)}
                      >
                        {stock.ticker}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sentiment-correlation-content">
                  {selectedStockForCorrelation ? (
                    <div className="space-y-4">
                      {(() => {
                        const currentCorrelation = correlationData.find(c => c.symbol === selectedStockForCorrelation);
                        const currentStock = transformedData.find(s => s.ticker === selectedStockForCorrelation);
                        
                        if (!currentCorrelation || !currentStock) {
                          return (
                            <div className="sentiment-correlation-placeholder">
                              <div className="sentiment-correlation-placeholder-content">
                                <Activity className="sentiment-correlation-placeholder-icon" />
                                <p className="sentiment-correlation-placeholder-text">Loading correlation data for {selectedStockForCorrelation}...</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-6">
                            {/* Current Metrics */}
                            <div className="sentiment-correlation-metrics">
                              <div className="sentiment-correlation-metric">
                                <div className="sentiment-correlation-metric-value sentiment-correlation-metric-value-primary">${currentStock.price.toFixed(2)}</div>
                                <div className="sentiment-correlation-metric-label">Current Price</div>
                              </div>
                              <div className="sentiment-correlation-metric">
                                <div className={`sentiment-correlation-metric-value ${
                                  currentStock.sentiment >= 0.7 ? 'sentiment-correlation-metric-value-success' :
                                  currentStock.sentiment >= 0.5 ? 'sentiment-correlation-metric-value-warning' :
                                  'sentiment-correlation-metric-value-destructive'
                                }`}>
                                  {(currentStock.sentiment * 100).toFixed(0)}%
                                </div>
                                <div className="sentiment-correlation-metric-label">Sentiment</div>
                              </div>
                              <div className="sentiment-correlation-metric">
                                <div className={`sentiment-correlation-metric-value ${currentStock.priceChange >= 0 ? 'sentiment-correlation-metric-value-success' : 'sentiment-correlation-metric-value-destructive'}`}>
                                  {currentStock.priceChange >= 0 ? '+' : ''}{currentStock.priceChange}%
                                </div>
                                <div className="sentiment-correlation-metric-label">Price Change</div>
                              </div>
                              <div className="sentiment-correlation-metric">
                                <div className="sentiment-correlation-metric-value sentiment-correlation-metric-value-blue">
                                  {currentStock.mentions}
                                </div>
                                <div className="sentiment-correlation-metric-label">Mentions</div>
                              </div>
                            </div>

                            {/* Actual Price vs Sentiment Chart */}
                            <div className="sentiment-correlation-chart">
                              <h4 className="sentiment-correlation-chart-title">Price vs Sentiment Over Time - {currentStock.ticker}</h4>
                              <ChartContainer
                                config={{
                                  price: {
                                    label: "Price ($)",
                                    color: "hsl(var(--chart-1))",
                                  },
                                  sentiment: {
                                    label: "Sentiment (%)",
                                    color: "hsl(var(--chart-2))",
                                  },
                                }}
                                className="h-[400px] w-full"
                              >
                                <LineChart
                                  data={(() => {
                                    // Generate mock historical data for visualization
                                    const basePrice = currentStock.price;
                                    const baseSentiment = currentStock.sentiment * 100;
                                    const hours = [];
                                    
                                    for (let i = 23; i >= 0; i--) {
                                      const time = new Date();
                                      time.setHours(time.getHours() - i);
                                      
                                      // Generate realistic price fluctuations
                                      const priceVariation = (Math.random() - 0.5) * (basePrice * 0.02); // ±2% variation
                                      const price = Math.max(0, basePrice + priceVariation);
                                      
                                      // Generate sentiment that somewhat correlates with price changes
                                      const sentimentBase = baseSentiment;
                                      const correlation = Math.random() > 0.3 ? 1 : -1; // 70% correlation
                                      const sentimentVariation = (priceVariation / basePrice) * 100 * correlation + (Math.random() - 0.5) * 10;
                                      const sentiment = Math.max(0, Math.min(100, sentimentBase + sentimentVariation));
                                      
                                      hours.push({
                                        time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                        price: parseFloat(price.toFixed(2)),
                                        sentiment: parseFloat(sentiment.toFixed(1)),
                                        // Normalize sentiment for secondary Y-axis (scale to price range)
                                        sentimentScaled: parseFloat((sentiment * basePrice / 100).toFixed(2))
                                      });
                                    }
                                    
                                    return hours;
                                  })()}
                                  margin={{
                                    top: 20,
                                    right: 80,
                                    left: 20,
                                    bottom: 20,
                                  }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis 
                                    dataKey="time" 
                                    hide={true}
                                  />
                                  <YAxis 
                                    yAxisId="price"
                                    orientation="left"
                                    domain={['dataMin - 5', 'dataMax + 5']}
                                    tick={{ fontSize: 12 }}
                                    label={{ value: 'Price ($)', angle: -90, position: 'insideLeft' }}
                                  />
                                  <YAxis 
                                    yAxisId="sentiment"
                                    orientation="right"
                                    domain={[0, 100]}
                                    tick={{ fontSize: 12 }}
                                    label={{ value: 'Sentiment (%)', angle: 90, position: 'insideRight' }}
                                  />
                                  <ChartTooltip 
                                    content={({ active, payload, label }) => {
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                                            <div className="grid gap-2">
                                              <div className="font-medium">{label}</div>
                                              <div className="grid gap-1 text-sm">
                                                <div className="flex items-center gap-2">
                                                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                  <span>Price: ${payload[0]?.value}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                  <span>Sentiment: {payload[1]?.value}%</span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Line 
                                    yAxisId="price"
                                    type="monotone" 
                                    dataKey="price" 
                                    stroke="hsl(var(--chart-1))"
                                    strokeWidth={2}
                                    dot={{ r: 3 }}
                                    activeDot={{ r: 5 }}
                                    name="Price"
                                  />
                                  <Line 
                                    yAxisId="sentiment"
                                    type="monotone" 
                                    dataKey="sentiment" 
                                    stroke="hsl(var(--chart-2))"
                                    strokeWidth={2}
                                    dot={{ r: 3 }}
                                    activeDot={{ r: 5 }}
                                    strokeDasharray="5 5"
                                    name="Sentiment"
                                  />
                                </LineChart>
                              </ChartContainer>
                            </div>

                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="sentiment-correlation-placeholder">
                      <div className="sentiment-correlation-placeholder-content">
                        <Activity className="sentiment-correlation-placeholder-icon" />
                        <p className="sentiment-correlation-placeholder-text">Select a stock above to view price vs sentiment correlation</p>
                        <p className="sentiment-correlation-placeholder-subtext">Click on any stock button to load correlation analysis</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sentiment Heatmap Tab */}
            {activeTab === 'heatmap' && (
              <div className="sentiment-heatmap-card">
                <div className="sentiment-heatmap-header">
                  <div className="sentiment-heatmap-title">Sentiment Heatmap</div>
                </div>
                <div className="sentiment-heatmap-content">
                  <div className="sentiment-heatmap-grid">
                    {transformedData.map(stock => {
                      const intensity = stock.sentiment;
                      const bgClass = intensity >= 0.7 ? 'sentiment-heatmap-item-success' : 
                                     intensity >= 0.5 ? 'sentiment-heatmap-item-warning' : 'sentiment-heatmap-item-destructive';
                      const opacity = Math.abs(intensity - 0.5) * 2;
                      
                      return (
                        <div
                          key={stock.ticker}
                          className={`sentiment-heatmap-item ${bgClass}`}
                          style={{ opacity: 0.3 + (opacity * 0.7) }}
                          onClick={() => setSelectedTicker(stock.ticker)}
                        >
                          <div className="sentiment-heatmap-ticker">{stock.ticker}</div>
                          <div className="sentiment-heatmap-percentage">
                            {(intensity * 100).toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sentiment-heatmap-legend">
                    <div className="sentiment-heatmap-legend-item">
                      <div className="sentiment-heatmap-legend-color sentiment-heatmap-legend-color-destructive"></div>
                      <span>Negative</span>
                    </div>
                    <div className="sentiment-heatmap-legend-item">
                      <div className="sentiment-heatmap-legend-color sentiment-heatmap-legend-color-warning"></div>
                      <span>Neutral</span>
                    </div>
                    <div className="sentiment-heatmap-legend-item">
                      <div className="sentiment-heatmap-legend-color sentiment-heatmap-legend-color-success"></div>
                      <span>Positive</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};