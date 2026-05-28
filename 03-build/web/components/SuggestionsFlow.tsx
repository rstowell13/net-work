"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import {
  bandColor,
  bandLabel,
  computeFreshness,
} from "@/lib/scoring/freshness";

interface Candidate {
  contactId: string;
  displayName: string;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
  freshness: number;
  band: string;
  daysSince: number | null;
  reason: string;
}

interface Props {
  candidates: Candidate[];
  cadence: { targetPerWeek: number; personalPct: number };
}

export function SuggestionsFlow({ candidates, cadence }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [neverList, setNeverList] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [committed, setCommitted] = useState(false);

  const remaining = candidates.filter(
    (c) =>
      !picked.includes(c.contactId) &&
      !skipped.includes(c.contactId) &&
      !neverList.includes(c.contactId),
  );
  const cur = remaining[0];
  const target = cadence.targetPerWeek;
  const reachedTarget = picked.length >= target;

  const decide = async (
    decision: "pick" | "skip" | "never",
  ) => {
    if (!cur) return;
    if (decision === "pick") setPicked((p) => [...p, cur.contactId]);
    if (decision === "skip") setSkipped((s) => [...s, cur.contactId]);
    if (decision === "never") {
      setNeverList((n) => [...n, cur.contactId]);
      // Persist suggestion_status='never' immediately so they don't re-appear
      await fetch(`/api/contacts/${cur.contactId}/suggestion-status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "never" }),
      });
    }
  };

  const commit = () =>
    start(async () => {
      const r = await fetch("/api/weekly-plan/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactIds: picked,
          source: "suggestions_flow",
        }),
      });
      if (r.ok) {
        setCommitted(true);
        router.push("/");
      }
    });

  if (committed) {
    return (
      <p className="text-[15px]" style={{ color: "var(--ink-muted)" }}>
        Plan committed. Redirecting…
      </p>
    );
  }

  if (!cur) {
    return (
      <div className="py-10">
        <h2
          className="m-0 mb-4"
          style={{
            fontFamily:
              "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 36,
            letterSpacing: "-0.022em",
          }}
        >
          {picked.length} pick{picked.length === 1 ? "" : "s"}.
        </h2>
        <p
          className="m-0 mb-6 max-w-[60ch] text-[15px] leading-[1.6]"
          style={{ color: "var(--ink-muted)" }}
        >
          {picked.length >= target
            ? `You hit the target. Commit to lock the week in.`
            : `Below your weekly target of ${target}, but commit anyway if these are the right people.`}
        </p>
        <div className="flex gap-3">
          <button
            onClick={commit}
            disabled={pending || picked.length === 0}
            className="rounded-lg border-0 bg-[var(--ink)] px-5 py-3 text-[14px] font-semibold text-[var(--stone)] disabled:opacity-50"
          >
            {pending ? "Committing…" : `Commit ${picked.length}`}
          </button>
          <button
            onClick={() => {
              setPicked([]);
              setSkipped([]);
              setNeverList([]);
            }}
            className="rounded-lg border bg-transparent px-5 py-3 text-[14px] font-medium"
            style={{
              borderColor: "var(--rule)",
              color: "var(--ink-muted)",
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const freshness = computeFreshness({
    lastSeenAt:
      cur.daysSince !== null
        ? new Date(nowMs - cur.daysSince * 86400_000)
        : null,
    interactions365: 0,
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <span
          className="text-[11.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Picked {picked.length} / {target}
          {reachedTarget && " — target hit"}
        </span>
        <span
          className="text-[11.5px] tabular-nums"
          style={{ color: "var(--ink-faint)" }}
        >
          {remaining.length} remaining
        </span>
      </div>

      <article
        className="rounded-2xl border bg-[var(--stone-raised)] p-5 md:p-9"
        style={{ borderColor: "var(--rule)" }}
      >
        {/* Mobile header */}
        <header className="mb-6 md:hidden">
          <div className="flex items-center justify-between gap-4">
            <Avatar
              id={cur.contactId}
              name={cur.displayName}
              photoUrl={cur.photoUrl}
              size="lg"
            />
            <div className="flex flex-col items-center gap-1.5">
              <FreshnessRing result={freshness} size="md" />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: bandColor(freshness.band) }}
              >
                {bandLabel(freshness.band)}
              </span>
            </div>
          </div>
          <h1
            className="m-0 mt-4 break-words"
            style={{
              fontFamily:
                "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(28px, 8vw, 40px)",
              lineHeight: 0.98,
              letterSpacing: "-0.022em",
            }}
          >
            {cur.displayName}
          </h1>
          <p
            className="m-0 mt-2 text-[12.5px]"
            style={{ color: "var(--ink-faint)" }}
          >
            {cur.category && <span>{cur.category} · </span>}
            {cur.reason}
          </p>
        </header>

        {/* Desktop header — original layout */}
        <header
          className="mb-7 hidden grid-cols-[96px_1fr_auto] items-start gap-6 md:grid"
        >
          <Avatar
            id={cur.contactId}
            name={cur.displayName}
            photoUrl={cur.photoUrl}
            size="xl"
          />
          <div>
            <h1
              className="m-0 mb-2"
              style={{
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 0.98,
                letterSpacing: "-0.022em",
              }}
            >
              {cur.displayName}
            </h1>
            <p
              className="m-0 text-[13px]"
              style={{ color: "var(--ink-faint)" }}
            >
              {cur.category && <span>{cur.category} · </span>}
              {cur.reason}
            </p>
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
          className="grid grid-cols-3 gap-2 border-t pt-5 md:gap-3 md:pt-6"
          style={{ borderColor: "var(--rule)" }}
        >
          <button
            onClick={() => decide("never")}
            className="rounded-lg border bg-transparent px-2 py-3 text-[12.5px] font-medium hover:border-[var(--cold-red)] hover:text-[var(--cold-red)] md:px-4 md:py-4 md:text-[14px]"
            style={{
              borderColor: "var(--rule)",
              color: "var(--ink-muted)",
            }}
          >
            Never suggest
          </button>
          <button
            onClick={() => decide("skip")}
            className="rounded-lg border bg-transparent px-2 py-3 text-[12.5px] font-medium md:px-4 md:py-4 md:text-[14px]"
            style={{
              borderColor: "var(--rule)",
              color: "var(--ink-muted)",
            }}
          >
            Not this week
          </button>
          <button
            onClick={() => decide("pick")}
            className="rounded-lg border-0 px-2 py-3 text-[12.5px] font-semibold md:px-4 md:py-4 md:text-[14px]"
            style={{ background: "var(--ink)", color: "var(--stone)" }}
          >
            Reach out →
          </button>
        </div>
      </article>

      {picked.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span
            className="text-[11.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--ink-faint)" }}
          >
            Picks so far
          </span>
          {candidates
            .filter((c) => picked.includes(c.contactId))
            .map((c) => (
              <span
                key={c.contactId}
                className="rounded-md border bg-[var(--stone-raised)] px-2.5 py-1 text-[12.5px]"
                style={{ borderColor: "var(--rule)" }}
              >
                {c.displayName}
              </span>
            ))}
          <button
            onClick={commit}
            disabled={pending}
            className="ml-auto rounded-md border-0 bg-[var(--ink)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--stone)] disabled:opacity-50"
          >
            {pending ? "…" : `Commit ${picked.length}`}
          </button>
        </div>
      )}
    </>
  );
}
