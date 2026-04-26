/**
 * Full-width top bar — brand on the left, global search in the middle,
 * theme toggle and help on the right. Sticky.
 *
 * Lifted from 02-design/mockups/home/chosen.html.
 */
export function TopBar() {
  return (
    <header
      className="sticky top-0 z-50 grid items-center gap-6 border-b px-6 py-3 backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--stone) 92%, transparent)",
        borderColor: "var(--rule)",
        gridTemplateColumns: "200px minmax(0, 1fr) auto",
      }}
    >
      <div
        className="serif-display text-[22px] leading-none"
        style={{ color: "var(--ink)" }}
      >
        net-work
      </div>

      <div
        className="flex w-full items-center gap-2 rounded-[10px] border px-4 py-[9px]"
        style={{
          background: "var(--stone-raised)",
          borderColor: "var(--rule)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--ink-faint)" }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <input
          placeholder="Search contacts, tags, or notes"
          className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--ink-faint)]"
          style={{ color: "var(--ink)" }}
        />
        <span
          className="rounded px-1.5 py-px font-mono text-[10.5px]"
          style={{
            background: "var(--stone-sunken)",
            color: "var(--ink-muted)",
          }}
        >
          /
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className="rounded-[7px] border px-3 py-[7px] text-xs font-medium"
          style={{
            borderColor: "var(--rule)",
            color: "var(--ink-muted)",
          }}
        >
          Theme · light
        </button>
        <button
          className="rounded-[7px] border px-3 py-[7px] text-xs font-medium"
          style={{
            borderColor: "var(--rule)",
            color: "var(--ink-muted)",
          }}
        >
          ?
        </button>
      </div>
    </header>
  );
}
