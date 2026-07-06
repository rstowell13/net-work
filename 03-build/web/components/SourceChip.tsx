/**
 * Small uppercase pill — the shared class cluster behind source-name chips
 * (TriageCard, SuggestionsFlow-adjacent surfaces), category badges
 * (HomePlan, ContactsList), and status badges (merge pages). Callers own the
 * label text and colors; this just centralizes the repeated geometry
 * (`rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]`).
 */
export function SourceChip({
  label,
  background = "var(--stone-sunken)",
  color = "var(--ink-muted)",
}: {
  label: string;
  background?: string;
  color?: string;
}) {
  return (
    <span
      className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
      style={{ background, color }}
    >
      {label}
    </span>
  );
}
