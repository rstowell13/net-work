import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TriageRulesForm } from "@/components/TriageRulesForm";
import { requireUser } from "@/lib/auth";
import { getTriageRules } from "@/lib/triage/rules";

export const dynamic = "force-dynamic";

export default async function TriageSettingsPage() {
  const user = await requireUser();
  const rules = await getTriageRules(user.id);
  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-faint)" }}>
          <Link href="/settings" style={{ color: "var(--ink-muted)" }}>
            Settings
          </Link>{" "}
          / Triage
        </p>
        <h1
          className="m-0 mb-6"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1,
            letterSpacing: "-0.022em",
          }}
        >
          Triage filter.
        </h1>
        <p
          className="m-0 mb-10 max-w-[60ch] text-[14px] leading-[1.6]"
          style={{ color: "var(--ink-muted)" }}
        >
          Decide who lands in your triage queue. Tighter settings keep
          address-book clutter and one-off contacts out; looser settings surface
          more people. Nothing is deleted — contacts hidden here come straight
          back if you loosen the filter.
        </p>
        <TriageRulesForm initial={rules} />
      </div>
    </AppShell>
  );
}
