import type { MonthlyReturn } from "@/lib/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cellColor(ret: number): string {
  if (ret > 0.05) return "hsl(152, 60%, 35%)";
  if (ret > 0.02) return "hsl(152, 50%, 28%)";
  if (ret > 0) return "hsl(152, 40%, 20%)";
  if (ret > -0.02) return "hsl(0, 40%, 20%)";
  if (ret > -0.05) return "hsl(0, 50%, 28%)";
  return "hsl(0, 60%, 35%)";
}

interface Props {
  returns: MonthlyReturn[];
}

export const MonthlyReturns = ({ returns }: Props) => {
  if (returns.length === 0) return null;

  // Group by year
  const byYear = new Map<number, Map<number, number>>();
  for (const r of returns) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    byYear.get(r.year)!.set(r.month, r.ret);
  }

  const years = Array.from(byYear.keys()).sort();

  return (
    <div style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="section-header">
        <span className="label">MONTHLY RETURNS</span>
      </div>
      <div className="px-5 py-3 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th-left" style={{ width: "50px" }}>Year</th>
              {MONTHS.map((m) => (
                <th key={m} className="th" style={{ width: "52px" }}>
                  {m}
                </th>
              ))}
              <th className="th" style={{ width: "60px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const monthMap = byYear.get(year)!;
              const yearTotal = Array.from(monthMap.values()).reduce(
                (acc, r) => acc * (1 + r),
                1
              ) - 1;
              return (
                <tr key={year} className="tr">
                  <td className="td-left text-muted-foreground">{year}</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                    const ret = monthMap.get(month);
                    return (
                      <td
                        key={month}
                        className="td"
                        style={{
                          background: ret !== undefined ? cellColor(ret) : "transparent",
                          color: ret !== undefined ? "hsl(0, 0%, 90%)" : "hsl(0, 0%, 30%)",
                        }}
                      >
                        {ret !== undefined ? `${(ret * 100).toFixed(1)}` : "—"}
                      </td>
                    );
                  })}
                  <td
                    className="td font-semibold"
                    style={{
                      color: `hsl(var(--${yearTotal >= 0 ? "primary" : "destructive"}))`,
                    }}
                  >
                    {(yearTotal * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
