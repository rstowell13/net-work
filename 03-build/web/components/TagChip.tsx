import { tagChipStyle } from "@/lib/tags/colors";

/**
 * A custom-tag pill. Rounded + sentence-case to read distinctly from the
 * squared, UPPERCASE category badge. Pass onRemove to show an inline ×.
 */
export function TagChip({
  name,
  color,
  onRemove,
  size = "sm",
}: {
  name: string;
  color: string | null;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  const s = tagChipStyle(color);
  const pad =
    size === "md" ? "px-2.5 py-1 text-[12.5px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${pad}`}
      style={{ background: s.background, color: s.color }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name}`}
          className="-mr-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" width="9" height="9" fill="none">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
