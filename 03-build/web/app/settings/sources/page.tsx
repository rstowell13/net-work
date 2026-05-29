/**
 * /settings/sources — connect & manage data sources.
 *
 * v1 sources: Google Contacts, Gmail, Google Calendar (one OAuth grants all 3),
 * LinkedIn CSV (file upload), Mac agent (M3, placeholder for now).
 *
 * Refs: ROADMAP M2.1
 * Visual contract: derived from the AppShell + design tokens.
 */
import { AppShell } from "@/components/AppShell";
import { SyncButton, UploadCsvButton } from "@/components/SourceActions";
import { MacAgentCard } from "@/components/MacAgentCard";
import { requireUser } from "@/lib/auth";
import { getAllSourcesForUser, SOURCE_LABELS, type SourceKind, type SourceRow } from "@/lib/sources";

export const dynamic = "force-dynamic";

const DESCRIPTIONS: Record<SourceKind, string> = {
  google_contacts: "Names, phone numbers, emails, photos, and any LinkedIn URLs you've stored on a contact in Google.",
  gmail: "All email threads — From / To / Subject / Date plus a short body preview. Click Sync now repeatedly to backfill older threads.",
  google_calendar: "All calendar events that include at least one external attendee.",
  linkedin_csv: "Upload your LinkedIn connections export (CSV) to add anyone Google doesn't already know about.",
  apple_contacts: "Read from your Mac's Contacts app via the Mac agent.",
  mac_agent: "Apple Contacts, iMessage history, and call logs from your Mac. One-line install; nightly auto-sync after that.",
};

function formatRelative(d: Date | null): string {
  if (!d) return "never";
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function StatusPill({ status }: { status: SourceRow["status"] | "not_connected" }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    not_connected: { bg: "var(--stone-sunken)", fg: "var(--ink-muted)", label: "Not connected" },
    connected: { bg: "rgba(110,138,106,0.18)", fg: "var(--sage)", label: "Connected" },
    needs_reauth: { bg: "rgba(177,66,40,0.16)", fg: "var(--madder)", label: "Reconnect needed" },
    error: { bg: "rgba(177,66,40,0.16)", fg: "var(--madder)", label: "Error" },
  };
  const s = styles[status] ?? styles.not_connected;
  return (
    <span
      className="rounded-md px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em]"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function SourceCard({
  kind,
  row,
  banner,
}: {
  kind: SourceKind;
  row?: SourceRow;
  banner?: string;
}) {
  const status = row?.status ?? "not_connected";
  const isGoogle = kind === "google_contacts" || kind === "gmail" || kind === "google_calendar";

  return (
    <article
      className="rounded-[10px] border p-6"
      style={{
        background: "var(--stone-raised)",
        borderColor: "var(--rule)",
      }}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-semibold tracking-[-0.018em]" style={{ color: "var(--ink)" }}>
            {SOURCE_LABELS[kind]}
          </h3>
          <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-muted)" }}>
            {DESCRIPTIONS[kind]}
          </p>
        </div>
        <StatusPill status={status} />
      </header>

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
        <p className="font-mono text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
          Last sync · {formatRelative(row?.lastSyncAt ?? null)}
        </p>

        {/* Action buttons per kind */}
        <div className="flex items-center gap-2">
          {/*
            Show Sync now when status is connected OR error (the source is
            still wired up — error usually means a transient quota/network
            blip that retrying clears). needs_reauth means the login expired,
            so offer Reconnect instead.
          */}
          {isGoogle && status === "needs_reauth" && (
            <a
              href="/api/auth/google/start"
              className="rounded-[7px] px-4 py-[7px] text-[13px] font-medium"
              style={{ background: "var(--ink)", color: "var(--stone)" }}
            >
              Reconnect
            </a>
          )}
          {isGoogle && row && (status === "connected" || status === "error") && (
            <SyncButton sourceId={row.id} />
          )}
          {kind === "linkedin_csv" && <UploadCsvButton />}
        </div>
      </div>

      {kind === "mac_agent" && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
          <MacAgentCard
            status={status}
            lastSyncAt={row?.lastSyncAt ?? null}
            lastSyncErrorPreview={
              row?.lastSyncError ? row.lastSyncError.slice(0, 200) : null
            }
          />
        </div>
      )}

      {banner && (
        <p
          className="mt-4 rounded-md px-3 py-2 text-[12.5px]"
          style={{ background: "rgba(177,66,40,0.08)", color: "var(--madder)" }}
        >
          {banner}
        </p>
      )}
    </article>
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sourceList = await getAllSourcesForUser(user.id);

  // Google sources can span multiple accounts — group them by account email.
  const GOOGLE_KINDS: SourceKind[] = [
    "google_contacts",
    "gmail",
    "google_calendar",
  ];
  const accountEmailOf = (s: SourceRow) =>
    s.accountEmail ||
    (s.config as { google_email?: string } | null)?.google_email ||
    "";
  const googleAccounts = new Map<string, SourceRow[]>();
  for (const s of sourceList) {
    if (!GOOGLE_KINDS.includes(s.kind)) continue;
    const key = accountEmailOf(s);
    const arr = googleAccounts.get(key) ?? [];
    arr.push(s);
    googleAccounts.set(key, arr);
  }
  const linkedinRow = sourceList.find((s) => s.kind === "linkedin_csv");
  const macRow = sourceList.find((s) => s.kind === "mac_agent");

  const params = await searchParams;
  const successBanner =
    params.connected === "google" ? "Google connected — syncs will start automatically." : null;
  const errorBanner = params.error ? `OAuth error: ${params.error}` : null;

  return (
    <AppShell active="/settings">
      <div className="mx-auto max-w-[920px] px-12 py-12 pb-24">
        <p
          className="mb-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Settings · Sources
        </p>
        <h1 className="serif-display mb-2 text-[44px] leading-none">Sources.</h1>
        <p className="mb-10 max-w-[64ch] text-[15px] leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          Connect each source you want to pull contacts and history from. Every source
          syncs into a single staging area before merge.
        </p>

        {(successBanner || errorBanner) && (
          <div
            className="mb-6 rounded-[10px] border px-4 py-3 text-[13.5px]"
            style={{
              background: errorBanner ? "rgba(177,66,40,0.08)" : "rgba(110,138,106,0.12)",
              borderColor: errorBanner ? "var(--madder)" : "var(--sage)",
              color: errorBanner ? "var(--madder)" : "var(--ink)",
            }}
          >
            {errorBanner ?? successBanner}
          </div>
        )}

        {/* Google accounts — one block per connected account */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              className="text-[12px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Google accounts
            </h2>
            <a
              href="/api/auth/google/start"
              className="rounded-[7px] px-3.5 py-[7px] text-[13px] font-medium"
              style={{ background: "var(--ink)", color: "var(--stone)" }}
            >
              + Add Google account
            </a>
          </div>

          {googleAccounts.size === 0 ? (
            <p
              className="rounded-[10px] border p-6 text-[13.5px] leading-relaxed"
              style={{
                borderColor: "var(--rule)",
                background: "var(--stone-raised)",
                color: "var(--ink-muted)",
              }}
            >
              No Google account connected yet. Click “Add Google account” to
              connect Contacts, Gmail, and Calendar.
            </p>
          ) : (
            [...googleAccounts.entries()].map(([email, rows]) => (
              <div key={email || "google"} className="mb-6">
                <p
                  className="mb-2 font-mono text-[12px]"
                  style={{ color: "var(--ink)" }}
                >
                  {email || "Google account"}
                </p>
                <div className="flex flex-col gap-4">
                  {GOOGLE_KINDS.map((kind) => {
                    const row = rows.find((r) => r.kind === kind);
                    return row ? (
                      <SourceCard key={kind} kind={kind} row={row} />
                    ) : null;
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Other sources */}
        <section>
          <h2
            className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--ink-faint)" }}
          >
            Other sources
          </h2>
          <div className="flex flex-col gap-4">
            <SourceCard kind="linkedin_csv" row={linkedinRow} />
            <SourceCard kind="mac_agent" row={macRow} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
