import { useState, useEffect } from "react";
import "./PortfolioManagement.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Plus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portfolioAPI, type HoldingWithMetrics, type HoldingCreate } from "@/lib/api";

export const PortfolioManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch holdings with real-time metrics
  const { data: holdings = [], isLoading, error } = useQuery({
    queryKey: ['holdings-with-metrics'],
    queryFn: portfolioAPI.getHoldingsWithMetrics,
    refetchInterval: 30000, // Refetch every 30 seconds for updated prices
  });

  const [newHolding, setNewHolding] = useState({
    symbol: "",
    quantity: "",
    buy_price: ""
  });

  // Mutations
  const addHoldingMutation = useMutation({
    mutationFn: portfolioAPI.createHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings-with-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview'] });
      setNewHolding({ symbol: "", quantity: "", buy_price: "" });
      toast({
        title: "Holding Added",
        description: "The holding has been added to your portfolio."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add holding: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: portfolioAPI.deleteHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings-with-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview'] });
      toast({
        title: "Holding Removed",
        description: "The holding has been removed from your portfolio."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to remove holding: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const uploadCSVMutation = useMutation({
    mutationFn: portfolioAPI.uploadCSV,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['holdings-with-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview'] });
      toast({
        title: response.success ? "Success" : "Warning", 
        description: response.message,
        variant: response.success ? "default" : "destructive"
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: `Failed to upload CSV: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const handleAddHolding = () => {
    if (!newHolding.symbol || !newHolding.quantity || !newHolding.buy_price) {
      toast({
        title: "Missing Information",
        description: "Please fill in symbol, quantity, and buy price.",
        variant: "destructive"
      });
      return;
    }

    const holdingData: HoldingCreate = {
      symbol: newHolding.symbol.toUpperCase(),
      quantity: parseFloat(newHolding.quantity),
      buy_price: parseFloat(newHolding.buy_price)
    };

    addHoldingMutation.mutate(holdingData);
  };

  const handleRemoveHolding = (id: string) => {
    deleteHoldingMutation.mutate(id);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadCSVMutation.mutate(file);
    }
    // Reset the input
    event.target.value = '';
  };

  const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const totalGainLoss = holdings.reduce((sum, holding) => sum + holding.gain_loss, 0);
  const totalGainLossPercent = totalGainLoss / (totalValue - totalGainLoss) * 100;

  return (
    <div className="pm-container">
      {/* Portfolio Summary */}
      <div className="pm-summary-grid">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Gain/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalGainLoss >= 0 ? '+' : ''}${totalGainLoss.toLocaleString()}
            </div>
            <div className={`text-sm ${totalGainLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalGainLoss >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{holdings.length}</div>
            <div className="text-sm text-muted-foreground">Active positions</div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Management Tabs */}
      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="upload">CSV Upload</TabsTrigger>
          <TabsTrigger value="holdings">Current Holdings</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add New Holding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Ticker Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="AAPL"
                    value={newHolding.symbol}
                    onChange={(e) => setNewHolding({...newHolding, symbol: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="100"
                    value={newHolding.quantity}
                    onChange={(e) => setNewHolding({...newHolding, quantity: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buy_price">Buy Price</Label>
                  <Input
                    id="buy_price"
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={newHolding.buy_price}
                    onChange={(e) => setNewHolding({...newHolding, buy_price: e.target.value})}
                  />
                </div>
              </div>
              <Button 
                onClick={handleAddHolding} 
                disabled={addHoldingMutation.isPending}
                className="w-full md:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                {addHoldingMutation.isPending ? "Adding..." : "Add Holding"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Portfolio CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="pm-upload-area">
                <Upload className="pm-upload-icon" />
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Upload your portfolio</h3>
                  <p className="pm-upload-subtitle">
                    CSV format: symbol, quantity, buy_price, buy_date (optional)
                  </p>
                </div>
                <div className="mt-4">
                  <Label htmlFor="csv-upload" className="cursor-pointer">
                    <Button variant="outline" asChild disabled={uploadCSVMutation.isPending}>
                      <span>{uploadCSVMutation.isPending ? "Uploading..." : "Choose File"}</span>
                    </Button>
                  </Label>
                  <Input
                    id="csv-upload"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploadCSVMutation.isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holdings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="pm-loading">
                  Loading holdings...
                </div>
              ) : error ? (
                <div className="pm-error">
                  Error loading holdings: {error.message}
                </div>
              ) : (
                <div className="space-y-4">
                  {holdings.length === 0 ? (
                    <div className="pm-empty">
                      No holdings found. Add some holdings to get started.
                    </div>
                  ) : (
                    holdings.map((holding) => (
                      <div key={holding.id} className="pm-holdings-row">
                        <div className="pm-holdings-grid flex-1">
                          <div>
                            <div className="font-medium">{holding.symbol}</div>
                            <div className="pm-label-muted">Symbol</div>
                          </div>
                          <div>
                            <div className="font-medium">{holding.quantity}</div>
                            <div className="pm-label-muted">Quantity</div>
                          </div>
                          <div>
                            <div className="font-medium">${holding.buy_price.toFixed(2)}</div>
                            <div className="pm-label-muted">Buy Price</div>
                          </div>
                          <div>
                            <div className="font-medium">${holding.current_price.toFixed(2)}</div>
                            <div className="pm-label-muted">Current</div>
                          </div>
                          <div>
                            <div className="font-medium">${holding.value.toLocaleString()}</div>
                            <div className="pm-label-muted">Value</div>
                          </div>
                          <div>
                            <Badge variant={holding.gain_loss >= 0 ? "default" : "destructive"}>
                              {holding.gain_loss >= 0 ? '+' : ''}${holding.gain_loss.toLocaleString()} 
                              ({holding.gain_loss >= 0 ? '+' : ''}{holding.gain_loss_percent.toFixed(1)}%)
                            </Badge>
                          </div>
                        </div>
                        <div className="pm-actions">
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveHolding(holding.id)}
                            disabled={deleteHoldingMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};