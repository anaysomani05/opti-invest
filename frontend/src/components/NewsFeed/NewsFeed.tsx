import { useQuery, useQueryClient } from "@tanstack/react-query";
import { marketAPI, NewsArticle } from "@/lib/api";
import { RefreshCw } from "lucide-react";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NewsFeed() {
  const queryClient = useQueryClient();
  const { data: articles = [], isLoading, isFetching } = useQuery({
    queryKey: ["market-news"],
    queryFn: marketAPI.getNews,
    refetchInterval: 3 * 60 * 1000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["market-news"] });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="section-header">
        <span className="label">Live News</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground tracking-wider">
            {articles.length > 0 ? `${articles.length} STORIES` : ""}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="p-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-xs tracking-wider">
            LOADING...
          </div>
        ) : articles.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-xs tracking-wider">
            NO NEWS AVAILABLE
          </div>
        ) : (
          <div>
            {articles.map((a, i) => (
              <article
                key={i}
                className="px-3 py-2.5 hover:bg-white/[0.025] transition-colors"
                style={{ borderBottom: "1px solid hsl(var(--border))" }}
              >
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[11px] leading-[1.5] text-foreground hover:text-primary transition-colors"
                >
                  {a.title}
                </a>
                <div className="flex items-center gap-2 mt-1">
                  {a.source && (
                    <span className="text-[9px] text-primary/70 tracking-wide uppercase">
                      {a.source}
                    </span>
                  )}
                  {a.published && (
                    <span className="text-[9px] text-muted-foreground tracking-wide">
                      {timeAgo(a.published)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
