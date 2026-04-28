/**
 * Full-width top bar.
 *
 * Desktop: brand · search · theme + help.
 * Mobile: brand · spacer · settings icon (search & help hidden — search
 * is reachable via the Contacts page, settings has no other entry point
 * once IconNav is hidden).
 *
 * Lifted from 02-design/mockups/home/chosen.html.
 */
import Link from "next/link";

export function TopBar() {
  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-md md:grid md:gap-6 md:px-6"
      style={{
        background: "color-mix(in srgb, var(--stone) 92%, transparent)",
        borderColor: "var(--rule)",
        gridTemplateColumns: "200px minmax(0, 1fr) auto",
      }}
    >
      <div
        className="serif-display shrink-0 text-[20px] leading-none md:text-[22px]"
        style={{ color: "var(--ink)" }}
      >
        net-work
      </div>

      {/* Search — desktop only */}
      <div
        className="hidden w-full items-center gap-2 rounded-[10px] border px-4 py-[9px] md:flex"
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

      {/* Push right group on mobile (no search) */}
      <div className="ml-auto md:ml-0" />

      <div className="flex items-center gap-1.5">
        <button
          className="hidden rounded-[7px] border px-3 py-[7px] text-xs font-medium md:inline-flex"
          style={{
            borderColor: "var(--rule)",
            color: "var(--ink-muted)",
          }}
        >
          Theme · light
        </button>
        <button
          className="hidden rounded-[7px] border px-3 py-[7px] text-xs font-medium md:inline-flex"
          style={{
            borderColor: "var(--rule)",
            color: "var(--ink-muted)",
          }}
        >
          ?
        </button>
        {/* Settings — mobile only (desktop reaches it via IconNav) */}
        <Link
          href="/settings"
          className="flex h-10 w-10 items-center justify-center rounded-[7px] border md:hidden"
          style={{
            borderColor: "var(--rule)",
            color: "var(--ink-muted)",
          }}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px]">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
