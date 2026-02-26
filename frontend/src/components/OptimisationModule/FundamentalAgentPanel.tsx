import type { FundamentalAgentOutput, FundamentalSignal } from "@/lib/api";

interface Props {
  data: FundamentalAgentOutput;
}

const valColor = (v: string) => {
  if (v === "undervalued") return "hsl(var(--primary))";
  if (v === "overvalued") return "hsl(var(--destructive))";
  return "hsl(var(--warning))";
};

const fmt = (v: any, suffix = "") => (v != null ? `${v}${suffix}` : "—");

export const FundamentalAgentPanel = ({ data }: Props) => {
  return (
    <section
      className="p-4 border rounded-sm overflow-x-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">Fundamental Analysis</div>
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <th className="text-left py-2">Symbol</th>
            <th className="text-right py-2">Score</th>
            <th className="text-center py-2">Valuation</th>
            <th className="text-right py-2">P/E</th>
            <th className="text-right py-2">Fwd P/E</th>
            <th className="text-right py-2">Rev Growth</th>
            <th className="text-right py-2">D/E</th>
            <th className="text-right py-2">ROE</th>
          </tr>
        </thead>
        <tbody>
          {data.signals.map((s: FundamentalSignal) => (
            <tr
              key={s.symbol}
              className="border-b"
              style={{ borderColor: "hsl(var(--border) / 0.4)" }}
            >
              <td className="py-2 font-medium">{s.symbol}</td>
              <td className="text-right py-2">{(s.score * 100).toFixed(0)}</td>
              <td className="text-center py-2">
                <span
                  className="text-[9px] px-1.5 py-0.5 border tracking-wider"
                  style={{ borderColor: valColor(s.valuation), color: valColor(s.valuation) }}
                >
                  {s.valuation.toUpperCase()}
                </span>
              </td>
              <td className="text-right py-2">{fmt(s.metrics.trailing_pe)}</td>
              <td className="text-right py-2">{fmt(s.metrics.forward_pe)}</td>
              <td className="text-right py-2">{fmt(s.metrics.revenue_growth, "%")}</td>
              <td className="text-right py-2">{fmt(s.metrics.debt_to_equity)}</td>
              <td className="text-right py-2">{fmt(s.metrics.roe, "%")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1">
        {data.signals.map((s) => (
          <div key={s.symbol} className="text-[10px] text-muted-foreground italic">
            {s.summary}
          </div>
        ))}
      </div>
    </section>
  );
};
