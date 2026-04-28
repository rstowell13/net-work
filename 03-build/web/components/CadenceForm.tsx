"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CadenceForm({
  initial,
}: {
  initial: {
    targetPerWeek: number;
    personalPct: number;
    minDaysSinceLastContact: number;
  };
}) {
  const router = useRouter();
  const [target, setTarget] = useState(initial.targetPerWeek);
  const [pct, setPct] = useState(initial.personalPct);
  const [minDays, setMinDays] = useState(initial.minDaysSinceLastContact);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await fetch("/api/cadence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetPerWeek: target,
          personalPct: pct,
          minDaysSinceLastContact: minDays,
        }),
      });
      if (r.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 max-w-[480px]">
      <Field
        label="Target per week"
        helper="How many people you want to reach out to each week."
      >
        <input
          type="number"
          min={1}
          max={20}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="w-24 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] tabular-nums outline-none focus:border-[var(--brass)]"
          style={{ borderColor: "var(--rule)" }}
        />
      </Field>

      <Field
        label="Personal mix"
        helper={`${pct}% personal · ${100 - pct}% business+both. Adjusts which categories the suggestion ranking favors.`}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field
        label="Min days since last contact"
        helper="Contacts you've reached out to within this window won't appear in suggestions."
      >
        <input
          type="number"
          min={0}
          max={365}
          value={minDays}
          onChange={(e) => setMinDays(Number(e.target.value))}
          className="w-24 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] tabular-nums outline-none focus:border-[var(--brass)]"
          style={{ borderColor: "var(--rule)" }}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border-0 bg-[var(--ink)] px-4 py-2 text-[13.5px] font-semibold text-[var(--stone)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save cadence"}
        </button>
        {saved && (
          <span
            className="text-[12.5px]"
            style={{ color: "var(--fresh-green)" }}
          >
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
