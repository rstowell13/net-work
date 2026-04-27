"use client";

/**
 * Interactive actions for a source card: Sync now button (Google sources)
 * and Upload CSV button (LinkedIn). Reports the result inline so Robb
 * sees record counts immediately without a page refresh.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  status: "success" | "partial" | "failed";
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  errorMessage?: string;
};

export function SyncButton({ sourceKind }: { sourceKind: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  const router = useRouter();

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await fetch(`/api/sync/${sourceKind}`, { method: "POST" });
      const json = (await res.json()) as SyncResult & { error?: string };
      if (!res.ok) {
        setResult({
          status: "failed",
          recordsSeen: 0,
          recordsNew: 0,
          recordsUpdated: 0,
          errorMessage: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setResult(json);
      router.refresh(); // refetch /settings/sources to show updated lastSyncAt
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={isPending}
        className="rounded-[7px] border px-3 py-[6px] text-[12.5px] font-medium transition-colors disabled:opacity-50"
        style={{
          borderColor: "var(--rule)",
          color: "var(--ink)",
          background: "var(--stone)",
        }}
      >
        {isPending ? "Syncing…" : "Sync now"}
      </button>
      {result && <ResultPill result={result} />}
    </div>
  );
}

export function UploadCsvButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);
  const router = useRouter();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/linkedin", { method: "POST", body: fd });
      const json = (await res.json()) as SyncResult & { error?: string };
      if (!res.ok) {
        setResult({
          status: "failed",
          recordsSeen: 0,
          recordsNew: 0,
          recordsUpdated: 0,
          errorMessage: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setResult(json);
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onChange}
        disabled={isPending}
        className="hidden"
        id="linkedin-csv-input"
      />
      <label
        htmlFor="linkedin-csv-input"
        className="cursor-pointer rounded-[7px] border px-3 py-[6px] text-[12.5px] font-medium transition-colors"
        style={{
          borderColor: "var(--rule)",
          color: "var(--ink)",
          background: "var(--stone)",
          opacity: isPending ? 0.5 : 1,
          pointerEvents: isPending ? "none" : "auto",
        }}
      >
        {isPending ? "Importing…" : "Upload CSV"}
      </label>
      {result && <ResultPill result={result} />}
    </div>
  );
}

function ResultPill({ result }: { result: SyncResult }) {
  if (result.status === "failed") {
    return (
      <span
        className="font-mono text-[11px]"
        style={{ color: "var(--madder)" }}
        title={result.errorMessage ?? ""}
      >
        ✕ {result.errorMessage?.slice(0, 60) ?? "failed"}
      </span>
    );
  }
  return (
    <span className="font-mono text-[11px]" style={{ color: "var(--sage)" }}>
      ✓ {result.recordsSeen} seen · {result.recordsNew} new · {result.recordsUpdated} updated
    </span>
  );
}
