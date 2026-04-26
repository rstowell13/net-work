/**
 * Temporary placeholder rendered for pages that haven't shipped yet.
 * Each page replaces this component with real content in its own milestone.
 */
import { AppShell } from "./AppShell";

export function PlaceholderPage({
  active,
  title,
  milestone,
}: {
  active: string;
  title: string;
  milestone: string;
}) {
  return (
    <AppShell active={active}>
      <div className="mx-auto max-w-[900px] px-14 py-16">
        <p
          className="mb-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Coming soon · {milestone}
        </p>
        <h1 className="serif-display text-[44px] leading-none">{title}</h1>
      </div>
    </AppShell>
  );
}
