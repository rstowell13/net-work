/**
 * Mobile-only bottom tab bar. Mirrors the icon set from the desktop
 * IconNav left rail but laid out horizontally and pinned to the bottom
 * of the viewport. Hidden on screens ≥ md (desktop uses IconNav).
 */
import Link from "next/link";

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: boolean;
};

const week = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[22px] w-[22px]">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const contacts = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[22px] w-[22px]">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
  </svg>
);
const triage = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[22px] w-[22px]">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M9 12h6M9 8h6M9 16h4" />
  </svg>
);
const merge = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[22px] w-[22px]">
    <path d="M7 4v6a4 4 0 0 0 4 4h6M17 14l-3-3m3 3-3 3" />
  </svg>
);
const followups = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[22px] w-[22px]">
    <path d="M5 6h14M5 12h14M5 18h10" />
  </svg>
);

const tabs: Tab[] = [
  { href: "/", label: "Week", icon: week },
  { href: "/contacts", label: "Contacts", icon: contacts },
  { href: "/triage", label: "Triage", icon: triage, badge: true },
  { href: "/merge", label: "Merge", icon: merge, badge: true },
  { href: "/follow-ups", label: "Follow-ups", icon: followups },
];

export function BottomTabNav({ active }: { active: string }) {
  return (
    <nav
      className="sticky bottom-0 z-50 flex items-stretch border-t backdrop-blur-md md:hidden"
      style={{
        background: "color-mix(in srgb, var(--stone) 96%, transparent)",
        borderColor: "var(--rule)",
        // Respect iOS safe area
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.href === "/" ? active === "/" : active.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5"
            style={{
              color: isActive ? "var(--ink)" : "var(--ink-muted)",
              minHeight: 56,
            }}
          >
            {tab.icon}
            <span
              className="text-[10px] font-medium"
              style={{ letterSpacing: "0.02em" }}
            >
              {tab.label}
            </span>
            {tab.badge && (
              <span
                className="absolute right-[calc(50%-16px)] top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--brass)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
