"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import { bandColor, bandLabel, type FreshnessResult } from "@/lib/scoring/freshness";

interface RecentItem {
  date: Date;
  channel: "imessage" | "email" | "call";
  preview: string;
}

interface Props {
  contact: {
    id: string;
    displayName: string;
    photoUrl: string | null;
  };
  freshness: FreshnessResult;
  sources: string[];
  lastSeenLabel: string;
  metaLine: string;
  signals: { sources: string; threads: number; calls: number; lastSeen: string };
  recent: RecentItem[];
  progress: { triaged: number; total: number };
}

export function TriageCard({
  contact,
  freshness,
  sources,
  lastSeenLabel,
  metaLine,
  signals,
  recent,
  progress,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCategory, setShowCategory] = useState(false);

  const submit = (
    decision: "keep" | "skip",
    category?: "personal" | "business" | "both",
  ) =>
    start(async () => {
      const r = await fetch("/api/triage/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, decision, category }),
      });
      if (r.ok) {
        setShowCategory(false);
        router.refresh();
      }
    });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showCategory) return;
      if (e.key === "ArrowLeft") submit("skip");
      if (e.key === "ArrowRight") setShowCategory(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCategory]);

  const pct =
    progress.total > 0
      ? Math.min(1, progress.triaged / progress.total)
      : 0;

  return (
    <>
      <div
        className="mb-7 flex items-center justify-between gap-4"
      >
        <div className="flex items-baseline gap-4">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--ink-faint)" }}
          >
            Triaged
          </span>
          <span
            style={{
              fontFamily:
                "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 28,
              lineHeight: 1,
              letterSpacing: "-0.012em",
              fontVariationSettings: "'opsz' 60",
            }}
          >
            {progress.triaged}
            <span
              className="text-[18px] font-normal not-italic"
              style={{ color: "var(--ink-faint)", fontFamily: "inherit" }}
            >
              {" "}
              / {progress.total}
            </span>
          </span>
        </div>
        <div
          className="relative h-1 max-w-[280px] flex-1 overflow-hidden rounded-sm"
          style={{ background: "var(--rule)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-sm"
            style={{
              width: `${pct * 100}%`,
              background: "var(--brass)",
            }}
          />
        </div>
      </div>

      <article
        className="mb-6 rounded-2xl border bg-[var(--stone-raised)] px-10 pb-8 pt-10"
        style={{ borderColor: "var(--rule)" }}
      >
        <header
          className="mb-7 grid items-start gap-6"
          style={{ gridTemplateColumns: "96px 1fr auto" }}
        >
          <Avatar
            id={contact.id}
            name={contact.displayName}
            photoUrl={contact.photoUrl}
            size="xl"
          />
          <div>
            <h1
              className="m-0 mb-2.5"
              style={{
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 48,
                lineHeight: 0.98,
                letterSpacing: "-0.022em",
                fontVariationSettings: "'opsz' 96",
              }}
            >
              {contact.displayName}
            </h1>
            <div
              className="flex flex-wrap items-center gap-2.5 text-[12.5px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              <span>{metaLine}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {sources.map((s) => (
                <span
                  key={s}
                  className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{
                    background: "var(--stone-sunken)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {s.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <FreshnessRing result={freshness} size="md" />
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: bandColor(freshness.band) }}
            >
              {bandLabel(freshness.band)}
            </span>
          </div>
        </header>

        <div
          className="mb-6 grid grid-cols-4 border-y py-4"
          style={{ borderColor: "var(--rule)" }}
        >
          <SignalCell label="Sources" value={signals.sources} />
          <SignalCell label="Threads" value={String(signals.threads)} />
          <SignalCell label="Calls" value={String(signals.calls)} />
          <SignalCell label="Last seen" value={lastSeenLabel} last />
        </div>

        {recent.length > 0 && (
          <div>
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Recent history
            </p>
            <div className="flex flex-col">
              {recent.map((r, i) => (
                <div
                  key={i}
                  className="grid gap-4 border-t py-3.5 first:border-t-0 first:pt-0"
                  style={{
                    gridTemplateColumns: "90px 1fr",
                    borderColor: "var(--rule)",
                  }}
                >
                  <div
                    className="text-[11.5px] tabular-nums"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {r.date.toLocaleDateString(undefined, {
                      month: "short",
                      day: "2-digit",
                    })}
                  </div>
                  <div>
                    <span
                      className="mb-1 inline-flex text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: channelColor(r.channel) }}
                    >
                      {r.channel}
                    </span>
                    <p
                      className="m-0 line-clamp-2 text-[13.5px] leading-[1.5]"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {r.preview}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="mt-6 grid items-center gap-4 border-t pt-6"
          style={{
            gridTemplateColumns: "1fr auto 1fr",
            borderColor: "var(--rule)",
          }}
        >
          <button
            disabled={pending}
            onClick={() => submit("skip")}
            className="flex items-center justify-center gap-2.5 rounded-lg border bg-[var(--stone-raised)] px-6 py-4 text-[15px] font-semibold disabled:opacity-50"
            style={{
              color: "var(--ink-muted)",
              borderColor: "var(--rule)",
            }}
          >
            Skip
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10.5px]"
              style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
            >
              ←
            </span>
          </button>
          <span
            aria-hidden
            className="block w-9 text-center text-[12px]"
            style={{ color: "var(--ink-faint)" }}
          />
          <button
            disabled={pending}
            onClick={() => setShowCategory(true)}
            className="flex items-center justify-center gap-2.5 rounded-lg border px-6 py-4 text-[15px] font-semibold disabled:opacity-50"
            style={{
              background: "var(--ink)",
              color: "var(--stone)",
              borderColor: "var(--ink)",
            }}
          >
            Keep
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10.5px]"
              style={{
                background: "rgba(247,244,236,0.18)",
                color: "var(--stone)",
              }}
            >
              →
            </span>
          </button>
        </div>
      </article>

      <p
        className="text-center text-[11.5px] tabular-nums"
        style={{ color: "var(--ink-faint)" }}
      >
        <Kbd>←</Kbd> skip · <Kbd>→</Kbd> keep · <Kbd>esc</Kbd> close
      </p>

      {showCategory && (
        <CategoryDialog
          onClose={() => setShowCategory(false)}
          onPick={(cat) => submit("keep", cat)}
          pending={pending}
        />
      )}
    </>
  );
}

function SignalCell({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className="px-4 first:pl-0"
      style={{
        borderRight: last ? undefined : "1px solid var(--rule)",
      }}
    >
      <p
        className="m-0 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {label}
      </p>
      <p className="m-0 text-[18px] font-semibold leading-[1.1] tabular-nums tracking-[-0.01em]">
        {value}
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-px font-mono text-[10.5px]"
      style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
    >
      {children}
    </span>
  );
}

function channelColor(c: "imessage" | "email" | "call"): string {
  switch (c) {
    case "imessage":
      return "var(--av-2)";
    case "email":
      return "var(--av-9)";
    case "call":
      return "var(--av-5)";
  }
}

function CategoryDialog({
  onClose,
  onPick,
  pending,
}: {
  onClose: () => void;
  onPick: (cat: "personal" | "business" | "both") => void;
  pending: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(28,24,19,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[90vw] rounded-2xl border bg-[var(--stone-raised)] p-7"
        style={{ borderColor: "var(--rule)" }}
      >
        <h2
          className="m-0 mb-2"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: "-0.018em",
          }}
        >
          Pick a category
        </h2>
        <p
          className="m-0 mb-5 text-[13.5px]"
          style={{ color: "var(--ink-muted)" }}
        >
          How do you mostly think about this person?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["personal", "Personal"],
              ["business", "Business"],
              ["both", "Both"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              disabled={pending}
              onClick={() => onPick(id)}
              className="rounded-lg border px-3 py-3 text-[14px] font-semibold disabled:opacity-50 hover:border-[var(--brass)] hover:bg-[var(--stone)]"
              style={{
                background: "var(--stone-raised)",
                borderColor: "var(--rule)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 text-[12px]"
          style={{ color: "var(--ink-muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
