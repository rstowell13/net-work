/**
 * 64px-wide icon-only left rail. Lifted from chosen.html mockups.
 * Active state highlights via brass-soft background.
 */
import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: boolean;
};

const week = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const contacts = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
  </svg>
);
const triage = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M9 12h6M9 8h6M9 16h4" />
  </svg>
);
const merge = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <path d="M7 4v6a4 4 0 0 0 4 4h6M17 14l-3-3m3 3-3 3" />
  </svg>
);
const followups = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <path d="M5 6h14M5 12h14M5 18h10" />
  </svg>
);
const settings = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px]" strokeWidth={1.5}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const items: NavItem[] = [
  { href: "/", label: "This week", icon: week },
  { href: "/contacts", label: "Contacts", icon: contacts },
  { href: "/triage", label: "Triage", icon: triage, badge: true },
  { href: "/merge", label: "Merge", icon: merge, badge: true },
  { href: "/follow-ups", label: "Follow-ups", icon: followups },
];

export function IconNav({ active }: { active: string }) {
  return (
    <aside
      className="sticky top-[60px] flex h-[calc(100dvh-60px)] flex-col items-center gap-1 border-r px-2 py-5"
      style={{ background: "var(--stone)", borderColor: "var(--rule)", width: 64 }}
    >
      {items.map((item) => {
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
            style={{
              background: isActive ? "var(--brass-soft)" : "transparent",
              color: isActive ? "var(--ink)" : "var(--ink-muted)",
            }}
          >
            {item.icon}
            {item.badge && (
              <span
                className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--brass)" }}
              />
            )}
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link
        href="/settings"
        title="Settings"
        className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
        style={{
          background: active.startsWith("/settings") ? "var(--brass-soft)" : "transparent",
          color: active.startsWith("/settings") ? "var(--ink)" : "var(--ink-muted)",
        }}
      >
        {settings}
      </Link>
    </aside>
  );
}
