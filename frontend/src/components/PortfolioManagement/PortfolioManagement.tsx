import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portfolioAPI, type HoldingCreate } from "@/lib/api";

const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type InputMode = "manual" | "csv";

export const PortfolioManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [form, setForm] = useState({ symbol: "", quantity: "", buy_price: "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["holdings-with-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
  };

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["holdings-with-metrics"],
    queryFn: portfolioAPI.getHoldingsWithMetrics,
    refetchInterval: 30000,
  });

  const addMutation = useMutation({
    mutationFn: portfolioAPI.createHolding,
    onSuccess: () => {
      invalidate();
      setForm({ symbol: "", quantity: "", buy_price: "" });
      toast({ title: "Position added" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: portfolioAPI.deleteHolding,
    onSuccess: () => {
      invalidate();
      toast({ title: "Position removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const csvMutation = useMutation({
    mutationFn: portfolioAPI.uploadCSV,
    onSuccess: (res) => {
      invalidate();
      toast({
        title: res.success ? "CSV imported" : "Import warning",
        description: res.message,
        variant: res.success ? "default" : "destructive",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!form.symbol.trim() || !form.quantity || !form.buy_price) {
      toast({
        title: "Missing fields",
        description: "Symbol, quantity and buy price are required.",
        variant: "destructive",
      });
      return;
    }
    const data: HoldingCreate = {
      symbol: form.symbol.trim().toUpperCase(),
      quantity: parseFloat(form.quantity),
      buy_price: parseFloat(form.buy_price),
    };
    addMutation.mutate(data);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) csvMutation.mutate(file);
    e.target.value = "";
  };

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalGL = holdings.reduce((s, h) => s + h.gain_loss, 0);
  const totalGLPct = totalValue - totalGL > 0 ? (totalGL / (totalValue - totalGL)) * 100 : 0;
  const isGain = totalGL >= 0;

  return (
    <div>
      {/* ── Summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="metric-cell">
          <div className="label mb-1">Total Value</div>
          <div className="stat-value">{fmt$(totalValue)}</div>
        </div>
        <div className="metric-cell">
          <div className="label mb-1">Unrealised P&amp;L</div>
          <div
            className="stat-value"
            style={{ color: `hsl(var(--${isGain ? "primary" : "destructive"}))` }}
          >
            {`${isGain ? "+" : "-"}${fmt$(totalGL)}`}
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: `hsl(var(--${isGain ? "primary" : "destructive"}))` }}
          >
            {`${isGain ? "+" : ""}${totalGLPct.toFixed(2)}%`}
          </div>
        </div>
        <div className="metric-cell" style={{ borderRight: 0 }}>
          <div className="label mb-1">Positions</div>
          <div className="stat-value">{holdings.length}</div>
        </div>
      </div>

      {/* ── Input mode toggle + form ───────────────────────────────── */}
      <div
        className="px-5 py-3 space-y-3"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        {/* Mode toggle */}
        <div className="flex items-center gap-1">
          <button
            className={`text-[10px] tracking-[0.15em] px-3 py-1 transition-colors ${
              inputMode === "manual"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{
              borderBottom:
                inputMode === "manual"
                  ? "1px solid hsl(var(--primary))"
                  : "1px solid transparent",
            }}
            onClick={() => setInputMode("manual")}
          >
            MANUAL ENTRY
          </button>
          <button
            className={`text-[10px] tracking-[0.15em] px-3 py-1 transition-colors ${
              inputMode === "csv"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{
              borderBottom:
                inputMode === "csv"
                  ? "1px solid hsl(var(--primary))"
                  : "1px solid transparent",
            }}
            onClick={() => setInputMode("csv")}
          >
            CSV UPLOAD
          </button>
        </div>

        {inputMode === "manual" ? (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <div className="label">Symbol</div>
              <input
                className="input-terminal"
                style={{ width: "90px" }}
                placeholder="AAPL"
                value={form.symbol}
                onChange={(e) =>
                  setForm({ ...form, symbol: e.target.value.toUpperCase() })
                }
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="space-y-1">
              <div className="label">Quantity</div>
              <input
                className="input-terminal"
                style={{ width: "90px" }}
                type="number"
                placeholder="100"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="space-y-1">
              <div className="label">Buy Price</div>
              <input
                className="input-terminal"
                style={{ width: "110px" }}
                type="number"
                step="0.01"
                placeholder="150.00"
                value={form.buy_price}
                onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <button
              className="btn-terminal-primary flex items-center gap-1.5"
              onClick={handleAdd}
              disabled={addMutation.isPending}
            >
              <Plus className="w-3 h-3" />
              {addMutation.isPending ? "ADDING..." : "ADD"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="text-xs text-muted-foreground">
              CSV format: <span className="text-foreground">symbol, quantity, buy_price, buy_date</span>
            </div>
            <label htmlFor="csv-upload">
              <div
                className="btn-terminal flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                {csvMutation.isPending ? "UPLOADING..." : "CHOOSE FILE"}
              </div>
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFile}
              disabled={csvMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* ── Holdings table ───────────────────────────────────────── */}
      <div className="section-header">
        <span className="label">Current Holdings</span>
        {holdings.length > 0 && (
          <span className="text-[10px] text-muted-foreground tracking-wider">
            {holdings.length} position{holdings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-muted-foreground text-xs tracking-wider">
          LOADING...
        </div>
      ) : holdings.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="text-muted-foreground text-xs tracking-wider mb-2">
            NO POSITIONS
          </div>
          <div className="text-[10px] text-muted-foreground">
            Use the form above to add your first position.
          </div>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <th className="th-left">Symbol</th>
              <th className="th">Qty</th>
              <th className="th">Buy Price</th>
              <th className="th">Current</th>
              <th className="th">Value</th>
              <th className="th">P&amp;L</th>
              <th className="th">P&amp;L %</th>
              <th className="th" style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const pos = h.gain_loss >= 0;
              return (
                <tr key={h.id} className="tr">
                  <td className="td-left">
                    <span
                      className="font-semibold"
                      style={{ color: "hsl(var(--primary))" }}
                    >
                      {h.symbol}
                    </span>
                  </td>
                  <td className="td">{h.quantity.toLocaleString()}</td>
                  <td className="td">${h.buy_price.toFixed(2)}</td>
                  <td className="td">${h.current_price.toFixed(2)}</td>
                  <td className="td">{fmt$(h.value)}</td>
                  <td
                    className="td"
                    style={{
                      color: `hsl(var(--${pos ? "primary" : "destructive"}))`,
                    }}
                  >
                    {`${pos ? "+" : "-"}${fmt$(h.gain_loss)}`}
                  </td>
                  <td
                    className="td"
                    style={{
                      color: `hsl(var(--${pos ? "primary" : "destructive"}))`,
                    }}
                  >
                    {`${pos ? "+" : ""}${h.gain_loss_percent.toFixed(2)}%`}
                  </td>
                  <td className="td">
                    <button
                      className="btn-terminal-ghost p-1"
                      onClick={() => deleteMutation.mutate(h.id)}
                      disabled={deleteMutation.isPending}
                      title="Remove position"
                    >
                      <Trash2
                        className="w-3 h-3"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
