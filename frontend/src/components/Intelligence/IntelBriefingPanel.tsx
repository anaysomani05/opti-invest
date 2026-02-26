interface Props {
  text: string;
}

export const IntelBriefingPanel = ({ text }: Props) => {
  const lines = text.split("\n");

  return (
    <section
      className="p-4 border rounded-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="label mb-3">Intelligence Briefing</div>
      <div className="space-y-2 text-xs leading-relaxed">
        {lines.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={i} className="h-2" />;
          if (trimmed.startsWith("## "))
            return (
              <div key={i} className="text-sm font-medium mt-2">
                {trimmed.slice(3)}
              </div>
            );
          if (trimmed.startsWith("**") && trimmed.endsWith("**"))
            return (
              <div key={i} className="font-medium" style={{ color: "hsl(var(--primary))" }}>
                {trimmed.slice(2, -2)}
              </div>
            );
          // Inline bold
          const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
          return (
            <div key={i} className="text-muted-foreground">
              {parts.map((part, j) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <span key={j} className="font-medium text-foreground">
                    {part.slice(2, -2)}
                  </span>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
