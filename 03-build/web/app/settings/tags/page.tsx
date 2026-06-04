import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TagManager } from "@/components/TagManager";
import { requireUser } from "@/lib/auth";
import { listTags } from "@/lib/tags/queries";

export const dynamic = "force-dynamic";

export default async function TagsSettingsPage() {
  const user = await requireUser();
  const tags = await listTags(user.id);
  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-faint)" }}>
          <Link href="/settings" style={{ color: "var(--ink-muted)" }}>
            Settings
          </Link>{" "}
          / Tags
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
          Tags.
        </h1>
        <p
          className="m-0 mb-10 max-w-[60ch] text-[14px] leading-[1.6]"
          style={{ color: "var(--ink-muted)" }}
        >
          Custom labels for slicing your network — college, volleyball, a former
          employer, anyone. A contact can carry as many as you like. Set per-tag
          outreach goals on the{" "}
          <Link
            href="/settings/cadence"
            style={{ color: "var(--brass-deep)", fontWeight: 500 }}
          >
            Cadence page
          </Link>
          .
        </p>
        <TagManager tags={tags} />
      </div>
    </AppShell>
  );
}
