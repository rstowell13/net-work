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
  const metaLine =
    item.daysSince !== null
      ? `last seen ${item.daysSince}d ago`
      : "no diary yet";

  return (
    <article
      className="rounded-2xl border bg-[var(--stone-raised)] p-4 md:p-5"
      style={{ borderColor: "var(--rule)" }}
    >
      {/* Mobile layout: stacked, whole top is the link target */}
      <div className="md:hidden">
        <Link
          href={`/contacts/${item.contactId}`}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <Avatar
              id={item.contactId}
              name={item.displayName}
              photoUrl={item.photoUrl}
              size="lg"
            />
            <h3
              className="m-0 min-w-0 break-words"
              style={{
                fontFamily:
                  "var(--font-serif, 'Source Serif 4'), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "clamp(22px, 6.2vw, 26px)",
                lineHeight: 1.05,
                letterSpacing: "-0.018em",
              }}
            >
              {item.displayName}
            </h3>
            <div className="flex flex-col items-center gap-1">
              <FreshnessRing result={item.freshness} size="sm" />
              <span
                className="text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: bandColor(item.freshness.band) }}
              >
                {bandLabel(item.freshness.band)}
              </span>
            </div>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 text-[12px] tabular-nums"
            style={{ color: "var(--ink-faint)" }}
          >
            {item.category && (
              <>
                <span
                  className="rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{
                    background: "var(--stone-sunken)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {item.category}
                </span>
                <Dot />
              </>
            )}
            <span>{metaLine}</span>
          </div>
          <p
            className="m-0 text-[13.5px] leading-[1.5]"
            style={{ color: "var(--ink-muted)" }}
          >
            {item.context}
          </p>
        </Link>
        <div
          className="mt-3 grid grid-cols-2 gap-2 border-t pt-3"
          style={{ borderColor: "var(--rule)" }}
        >
          <ToggleButton
            checked={reached}
            disabled={pending}
            onClick={() =>
              setStatus(reached ? "not_yet_reached" : "reached")
            }
            label="Reached out"
            tone="ink"
          />
          <ToggleButton
            checked={connected}
            disabled={pending || !reached}
            onClick={() =>
              setStatus(connected ? "reached" : "connected")
            }
            label="Connected"
            tone="sage"
          />
        </div>
      </div>

      {/* Desktop layout: original 4-col row */}
      <div
        className="hidden grid-cols-[auto_1fr_auto_auto] items-center gap-5 md:grid"
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
            <span>{metaLine}</span>
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

/** Mobile full-width toggle. Stops propagation so taps don't navigate. */
function ToggleButton({
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
  const fill = tone === "sage" ? "var(--fresh-green)" : "var(--ink)";
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-medium disabled:opacity-50"
      style={{
        background: checked ? fill : "var(--stone-sunken)",
        color: checked ? "var(--stone)" : "var(--ink-muted)",
        borderColor: checked ? fill : "var(--rule)",
      }}
    >
      <span
        className="flex h-[16px] w-[16px] flex-shrink-0 items-center justify-center rounded-sm border-[1.5px]"
        style={{
          background: checked ? "var(--stone)" : "transparent",
          borderColor: checked ? "var(--stone)" : "var(--ink-faint)",
        }}
      >
        {checked && (
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
            <path
              d="M3 8.5l3.5 3.5L13 5"
              stroke={fill}
              strokeWidth={2.5}
            />
          </svg>
        )}
      </span>
      {label}
    </button>
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
  const fill = tone === "sage" ? "var(--fresh-green)" : "var(--ink)";
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
