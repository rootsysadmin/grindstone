export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-6 flex flex-col gap-2">
      <h1 className="font-display font-bold text-xl">{title}</h1>
      <p className="text-text-dim text-sm">{note}</p>
    </div>
  );
}
