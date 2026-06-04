import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CadenceForm } from "@/components/CadenceForm";
import { TagCadenceForm } from "@/components/TagCadenceForm";
import { requireUser } from "@/lib/auth";
import { getCadence } from "@/lib/suggestions/candidates";
import { listTags } from "@/lib/tags/queries";
import { getTagCadenceState } from "@/lib/suggestions/tag-cadence-data";

export const dynamic = "force-dynamic";

export default async function CadencePage() {
  const user = await requireUser();
  const now = new Date();
  const [cadence, tags, { rules, shortfalls }] = await Promise.all([
    getCadence(user.id),
    listTags(user.id),
    getTagCadenceState(user.id, now),
  ]);
  const goals = rules.map((r) => ({
    tagId: r.tagId,
    tagName: r.tagName,
    targetCount: r.targetCount,
    window: r.window,
    reached: shortfalls.get(r.tagId)?.reached ?? 0,
  }));
  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        <p
          className="mb-2 text-[12px]"
          style={{ color: "var(--ink-faint)" }}
        >
          <Link href="/settings" style={{ color: "var(--ink-muted)" }}>
            Settings
          </Link>{" "}
          / Cadence
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
          Cadence.
        </h1>
        <p
          className="m-0 mb-10 max-w-[60ch] text-[14px] leading-[1.6]"
          style={{ color: "var(--ink-muted)" }}
        >
          These rules drive the candidate pool you see on /suggestions every
          Sunday. Looser numbers surface more people; tighter numbers keep the
          weekly list focused.
        </p>
        <CadenceForm initial={cadence} />

        <div
          className="mt-12 border-t pt-10"
          style={{ borderColor: "var(--rule)" }}
        >
          <h2
            className="m-0 mb-2"
            style={{
              fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.018em",
            }}
          >
            Per-tag goals.
          </h2>
          <p
            className="m-0 mb-6 max-w-[60ch] text-[14px] leading-[1.6]"
            style={{ color: "var(--ink-muted)" }}
          >
            Set an outreach target for any tag — &ldquo;1 volleyball friend a
            month.&rdquo; When you&rsquo;re behind for the period, those contacts
            get nudged up your weekly suggestions.
          </p>
          <TagCadenceForm tags={tags} goals={goals} />
        </div>
      </div>
    </AppShell>
  );
}
