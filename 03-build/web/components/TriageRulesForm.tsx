"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Rules {
  minTwoWay: number;
  minTotal: number;
  maxAgeDays: number | null;
}

// Engagement presets set the two-way / total knobs only; the recency window
// is controlled separately below.
const PRESETS: { key: string; label: string; desc: string; minTwoWay: number; minTotal: number }[] = [
  {
    key: "oneTwoWay",
    label: "One two-way exchange",
    desc: "They've both sent and received at least once.",
    minTwoWay: 1,
    minTotal: 0,
  },
  {
    key: "any",
    label: "Any interaction",
    desc: "At least one message either direction.",
    minTwoWay: 0,
    minTotal: 1,
  },
  {
    key: "several",
    label: "Several exchanges",
    desc: "A real back-and-forth (3+ each way).",
    minTwoWay: 3,
    minTotal: 0,
  },
  {
    key: "all",
    label: "Show everyone",
    desc: "No engagement filter at all.",
    minTwoWay: 0,
    minTotal: 0,
  },
];

const RECENCY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "No limit", days: null },
  { label: "Last 5 years", days: 1825 },
  { label: "Last 3 years", days: 1095 },
  { label: "Last 1 year", days: 365 },
];

export function TriageRulesForm({ initial }: { initial: Rules }) {
  const router = useRouter();
  const [minTwoWay, setMinTwoWay] = useState(initial.minTwoWay);
  const [minTotal, setMinTotal] = useState(initial.minTotal);
  const [maxAgeDays, setMaxAgeDays] = useState<number | null>(initial.maxAgeDays);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const activePreset = PRESETS.find(
    (p) => p.minTwoWay === minTwoWay && p.minTotal === minTotal,
  )?.key;

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setMinTwoWay(p.minTwoWay);
    setMinTotal(p.minTotal);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await fetch("/api/triage-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minTwoWay, minTotal, maxAgeDays }),
      });
      if (r.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-[520px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-semibold">Who shows up in triage</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => {
            const active = activePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-lg border px-4 py-3 text-left"
                style={{
                  borderColor: active ? "var(--brass)" : "var(--rule)",
                  background: active
                    ? "var(--stone-raised)"
                    : "var(--stone-raised)",
                  boxShadow: active
                    ? "inset 0 0 0 1px var(--brass)"
                    : undefined,
                }}
              >
                <span className="block text-[14px] font-semibold">
                  {p.label}
                </span>
                <span
                  className="mt-0.5 block text-[12px] leading-[1.45]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {p.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Field
        label="Recency window"
        helper="Hide contacts you haven't interacted with within this window."
      >
        <select
          value={maxAgeDays ?? "null"}
          onChange={(e) =>
            setMaxAgeDays(
              e.target.value === "null" ? null : Number(e.target.value),
            )
          }
          className="w-48 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] outline-none focus:border-[var(--brass)]"
          style={{ borderColor: "var(--rule)" }}
        >
          {RECENCY_OPTIONS.map((o) => (
            <option key={o.label} value={o.days ?? "null"}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <details className="text-[13px]">
        <summary
          className="cursor-pointer select-none font-semibold"
          style={{ color: "var(--ink-muted)" }}
        >
          Advanced
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          <Field
            label="Min two-way interactions"
            helper="Require at least this many exchanges in each direction (sent and received)."
          >
            <input
              type="number"
              min={0}
              max={50}
              value={minTwoWay}
              onChange={(e) => setMinTwoWay(Number(e.target.value))}
              className="w-24 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] tabular-nums outline-none focus:border-[var(--brass)]"
              style={{ borderColor: "var(--rule)" }}
            />
          </Field>
          <Field
            label="Min total interactions"
            helper="Require at least this many interactions overall (either direction)."
          >
            <input
              type="number"
              min={0}
              max={50}
              value={minTotal}
              onChange={(e) => setMinTotal(Number(e.target.value))}
              className="w-24 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] tabular-nums outline-none focus:border-[var(--brass)]"
              style={{ borderColor: "var(--rule)" }}
            />
          </Field>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border-0 bg-[var(--ink)] px-4 py-2 text-[13.5px] font-semibold text-[var(--stone)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save triage filter"}
        </button>
        {saved && (
          <span className="text-[12.5px]" style={{ color: "var(--fresh-green)" }}>
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{label}</span>
      {children}
      <span
        className="text-[12px] leading-[1.5]"
        style={{ color: "var(--ink-faint)" }}
      >
        {helper}
      </span>
    </label>
  );
}
