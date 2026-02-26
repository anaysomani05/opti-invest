import type { SentimentAgentOutput, StockSentiment } from "@/lib/api";

interface Props {
  data: SentimentAgentOutput;
}

const scoreColor = (score: number) => {
  if (score > 0.2) return "hsl(var(--primary))";
  if (score < -0.2) return "hsl(var(--destructive))";
  return "hsl(var(--warning))";
};

const scoreLabel = (score: number) => {
  if (score > 0.3) return "BULLISH";
  if (score > 0.1) return "LEAN BULL";
  if (score < -0.3) return "BEARISH";
  if (score < -0.1) return "LEAN BEAR";
  return "NEUTRAL";
};

const SentimentCard = ({ item }: { item: StockSentiment }) => {
  const color = scoreColor(item.score);
  return (
    <div className="p-3 border rounded-sm" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{item.symbol}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color }}>
            {item.score > 0 ? "+" : ""}{item.score.toFixed(2)}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 border tracking-wider"
            style={{ borderColor: color, color }}
          >
            {scoreLabel(item.score)}
          </span>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {item.headline_count} headlines • confidence {(item.confidence * 100).toFixed(0)}%
      </div>
      {item.catalysts.length > 0 && (
        <div className="space-y-0.5 mb-1.5">
          {item.catalysts.slice(0, 3).map((c, i) => {
            const url = item.headline_urls?.[c];
            return url ? (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[10px] text-muted-foreground truncate hover:text-foreground transition-colors underline decoration-border hover:decoration-foreground"
              >
                → {c}
              </a>
            ) : (
              <div key={i} className="text-[10px] text-muted-foreground truncate">
                → {c}
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[11px] italic text-muted-foreground">{item.summary}</div>
    </div>
  );
};

export const SentimentAgentPanel = ({ data }: Props) => {
  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="label">Sentiment Analysis</div>
        <div className="text-[9px] text-muted-foreground tracking-wider">
          METHOD: {data.method.toUpperCase()}
        </div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {data.sentiments.map((s) => (
          <SentimentCard key={s.symbol} item={s} />
        ))}
      </div>
    </section>
  );
};
