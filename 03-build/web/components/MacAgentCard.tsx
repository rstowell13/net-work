"use client";

/**
 * Mac agent card. Shows install command (with copy button) when not
 * connected, or last-sync status + token-rotation when connected.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  status: "not_connected" | "connected" | "needs_reauth" | "error";
  lastSyncAt: Date | null;
  lastSyncErrorPreview: string | null;
};

export function MacAgentCard({ status, lastSyncAt, lastSyncErrorPreview }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = () => {
    setCommand(null);
    setCopied(false);
    startTransition(async () => {
      const res = await fetch("/api/auth/agent/issue", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.command) {
        setCommand(json.command);
      } else {
        setCommand(`ERROR: ${json.error ?? `HTTP ${res.status}`}`);
      }
      router.refresh();
    });
  };

  const copy = async () => {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showInstall = status === "not_connected" || command !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {status === "connected" && (
          <button
            onClick={generate}
            disabled={isPending}
            className="rounded-[7px] border px-3 py-[6px] text-[12.5px] font-medium disabled:opacity-50"
            style={{ borderColor: "var(--rule)", color: "var(--ink)", background: "var(--stone)" }}
          >
            {isPending ? "Generating…" : "Rotate install token"}
          </button>
        )}
        {status !== "connected" && (
          <button
            onClick={generate}
            disabled={isPending}
            className="rounded-[7px] px-4 py-[7px] text-[13px] font-medium disabled:opacity-50"
            style={{ background: "var(--ink)", color: "var(--stone)" }}
          >
            {isPending ? "Generating…" : "Generate install command"}
          </button>
        )}
        {status === "connected" && lastSyncAt && (
          <span className="font-mono text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
            Connected · last push {formatRelative(lastSyncAt)}
          </span>
        )}
      </div>

      {showInstall && command && !command.startsWith("ERROR") && (
        <div
          className="rounded-md border p-3 font-mono text-[11.5px]"
          style={{ background: "var(--stone)", borderColor: "var(--rule)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[10.5px] uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Run this in Terminal
            </span>
            <button
              onClick={copy}
              className="rounded-[5px] border px-2 py-[2px] text-[10.5px]"
              style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <code className="block break-all leading-relaxed" style={{ color: "var(--ink)" }}>
            {command}
          </code>
          <p
            className="mt-3 max-w-[60ch] font-sans text-[12px] leading-relaxed"
            style={{ color: "var(--ink-muted)" }}
          >
            After running it, the installer prints two paths to add to{" "}
            <strong>System Settings → Privacy & Security → Full Disk Access</strong> and{" "}
            <strong>Contacts</strong>. The token shown above is sensitive — don&apos;t share it.
          </p>
        </div>
      )}
      {command && command.startsWith("ERROR") && (
        <p className="font-mono text-[11px]" style={{ color: "var(--madder)" }}>
          {command}
        </p>
      )}
      {lastSyncErrorPreview && (
        <p className="font-mono text-[11px]" style={{ color: "var(--madder)" }}>
          Last error: {lastSyncErrorPreview}
        </p>
      )}
    </div>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
