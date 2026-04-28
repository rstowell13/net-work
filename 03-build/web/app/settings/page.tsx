import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function SettingsPage() {
  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
        <h1
          className="m-0 mb-8"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 56,
            lineHeight: 1,
            letterSpacing: "-0.022em",
          }}
        >
          Settings.
        </h1>
        <div className="flex flex-col gap-2">
          <SettingsLink
            href="/settings/sources"
            title="Sources"
            desc="Connected accounts and the Mac agent."
          />
          <SettingsLink
            href="/settings/cadence"
            title="Cadence"
            desc="Weekly target, personal/business mix, min days since last contact."
          />
        </div>
      </div>
    </AppShell>
  );
}

function SettingsLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border bg-[var(--stone-raised)] px-5 py-4 hover:border-[var(--brass)]"
      style={{ borderColor: "var(--rule)" }}
    >
      <p
        className="m-0 text-[15px] font-semibold"
        style={{ color: "var(--ink)" }}
      >
        {title} →
      </p>
      <p
        className="m-0 mt-1 text-[12.5px]"
        style={{ color: "var(--ink-muted)" }}
      >
        {desc}
      </p>
    </Link>
  );
}
