"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import { bandColor, bandLabel, type FreshnessResult } from "@/lib/scoring/freshness";

export interface HomePlanItem {
  itemId: string;
  contactId: string;
  displayName: string;
  photoUrl: string | null;
  category: "personal" | "business" | "both" | null;
  status: "not_yet_reached" | "reached" | "connected";
  daysSince: number | null;
  freshness: FreshnessResult;
  context: string;
}

export function PlanCard({ item }: { item: HomePlanItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const setStatus = (
    next: "not_yet_reached" | "reached" | "connected",
  ) =>
    start(async () => {
      const r = await fetch(`/api/weekly-plan/item/${item.itemId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (r.ok) router.refresh();
    });

  const reached = item.status === "reached" || item.status === "connected";
  const connected = item.status === "connected";

  return (
    <article
      className="grid items-center gap-5 rounded-2xl border bg-[var(--stone-raised)] p-5"
      style={{
        gridTemplateColumns: "auto 1fr auto auto",
        borderColor: "var(--rule)",
      }}
    >
      <Avatar
        id={item.contactId}
        name={item.displayName}
        photoUrl={item.photoUrl}
        size="lg"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={`/contacts/${item.contactId}`}
          className="m-0 hover:underline"
        >
          <h3
            className="m-0 truncate"
            style={{
              fontFamily:
                "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 26,
              lineHeight: 1.05,
              letterSpacing: "-0.018em",
            }}
          >
            {item.displayName}
          </h3>
        </Link>
        <div
          className="flex flex-wrap items-center gap-2 text-[12.5px] tabular-nums"
          style={{ color: "var(--ink-faint)" }}
        >
          {item.category && (
            <>
              <span style={{ textTransform: "capitalize" }}>
                {item.category}
              </span>
              <Dot />
            </>
          )}
          <span>
            {item.daysSince !== null
              ? `last seen ${item.daysSince}d ago`
              : "no diary yet"}
          </span>
        </div>
        <p
          className="m-0 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--ink-muted)" }}
        >
          {item.context}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <FreshnessRing result={item.freshness} size="sm" />
        <span
          className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: bandColor(item.freshness.band) }}
        >
          {bandLabel(item.freshness.band)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckButton
          checked={reached}
          disabled={pending}
          tone="ink"
          onClick={() =>
            setStatus(reached ? "not_yet_reached" : "reached")
          }
          label="Reached out"
        />
        <CheckButton
          checked={connected}
          disabled={pending || !reached}
          tone="sage"
          onClick={() =>
            setStatus(connected ? "reached" : "connected")
          }
          label="Connected"
        />
      </div>
    </article>
  );
}

function Dot() {
  return (
    <span
      style={{
        width: 3,
        height: 3,
        borderRadius: "50%",
        background: "var(--ink-faint)",
        display: "inline-block",
      }}
    />
  );
}

function CheckButton({
  checked,
  disabled,
  onClick,
  label,
  tone,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  tone: "ink" | "sage";
}) {
  const fill = tone === "sage" ? "var(--sage)" : "var(--ink)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 text-[13px] font-medium disabled:opacity-50"
      style={{
        color: checked ? "var(--ink)" : "var(--ink-muted)",
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px]"
        style={{
          background: checked ? fill : "transparent",
          borderColor: checked ? fill : "var(--rule)",
        }}
      >
        {checked && (
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
            <path
              d="M3 8.5l3.5 3.5L13 5"
              stroke="var(--stone)"
              strokeWidth={2.5}
            />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
