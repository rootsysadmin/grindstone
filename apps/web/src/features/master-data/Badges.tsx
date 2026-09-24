const sourceStyles: Record<string, string> = {
  auto: "bg-blue/10 border-blue/30 text-blue",
  manual: "bg-pink/10 border-pink/40 text-pink",
  override: "bg-amber/10 border-amber/40 text-amber",
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${sourceStyles[source] ?? sourceStyles.manual}`}
    >
      {source}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "published") return null;
  return (
    <span className="font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border bg-white/5 border-white/20 text-text-dim">
      draft
    </span>
  );
}
