import type { NewsItem } from "@/lib/api";

interface Props {
  items: NewsItem[];
}

const LABEL_COLORS: Record<string, string> = {
  BULLISH: "hsl(var(--primary))",
  NEUTRAL: "hsl(var(--muted-foreground))",
  BEARISH: "hsl(var(--destructive))",
};

export const NewsFeed = ({ items }: Props) => {
  if (!items.length) {
    return (
      <section className="p-4 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="label mb-2">News Feed</div>
        <div className="text-xs text-muted-foreground">No headlines available.</div>
      </section>
    );
  }

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">News Feed</div>
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
        {items.map((item, i) => {
          const color = LABEL_COLORS[item.sentiment_label] || LABEL_COLORS.NEUTRAL;
          return (
            <div
              key={i}
              className="flex items-start gap-2 py-1.5 text-[11px]"
              style={{ borderBottom: "1px solid hsl(var(--border) / 0.3)" }}
            >
              <span
                className="flex-shrink-0 text-[9px] tracking-wider font-medium px-1.5 py-0.5 border rounded-sm mt-0.5"
                style={{ borderColor: color, color }}
              >
                {item.sentiment_label} {item.sentiment_score > 0 ? "+" : ""}
                {item.sentiment_score.toFixed(1)}
              </span>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-muted-foreground leading-relaxed hover:text-foreground transition-colors underline decoration-border hover:decoration-foreground"
                >
                  "{item.headline}"
                </a>
              ) : (
                <span className="flex-1 text-muted-foreground leading-relaxed">
                  "{item.headline}"
                </span>
              )}
              <span className="flex-shrink-0 text-[10px] font-medium">{item.symbol}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
