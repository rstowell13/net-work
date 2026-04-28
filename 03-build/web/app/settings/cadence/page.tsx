import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CadenceForm } from "@/components/CadenceForm";
import { requireUser } from "@/lib/auth";
import { getCadence } from "@/lib/suggestions/candidates";

export const dynamic = "force-dynamic";

export default async function CadencePage() {
  const user = await requireUser();
  const cadence = await getCadence(user.id);
  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[760px] px-14 pb-16 pt-8">
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
      </div>
    </AppShell>
  );
}
