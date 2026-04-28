"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RegenerateSummaryButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await fetch(
              `/api/contacts/${contactId}/regenerate-summary`,
              { method: "POST" },
            );
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              setErr(j.error ?? "Error");
              return;
            }
            router.refresh();
          })
        }
        style={{
          border: 0,
          background: "transparent",
          color: "var(--brass-deep)",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: "inherit",
          padding: 0,
        }}
      >
        {pending ? "Regenerating…" : "Regenerate →"}
      </button>
      {err && (
        <span style={{ color: "var(--cold-red)", marginLeft: 8 }}>{err}</span>
      )}
    </>
  );
}

export function AddNoteForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        start(async () => {
          const r = await fetch(`/api/contacts/${contactId}/note`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body }),
          });
          if (r.ok) {
            setBody("");
            router.refresh();
          }
        });
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a personal note about this contact…"
        className="w-full resize-y rounded-md border bg-[var(--stone-raised)] p-2 text-[13.5px] outline-none focus:border-[var(--brass)]"
        style={{ borderColor: "var(--rule)" }}
      />
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="self-start rounded-md border bg-[var(--ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--stone)] disabled:opacity-50"
        style={{ borderColor: "var(--ink)" }}
      >
        {pending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}

export function AddFollowUpForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          const r = await fetch(`/api/contacts/${contactId}/followup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (r.ok) {
            setText("");
            router.refresh();
          }
        });
      }}
      className="mt-3 flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a follow-up…"
        className="flex-1 rounded-md border bg-[var(--stone-raised)] px-3 py-1.5 text-[13.5px] outline-none focus:border-[var(--brass)]"
        style={{ borderColor: "var(--rule)" }}
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="rounded-md border bg-[var(--ink)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--stone)] disabled:opacity-50"
        style={{ borderColor: "var(--ink)" }}
      >
        {pending ? "…" : "Add"}
      </button>
    </form>
  );
}

export function FollowUpToggle({ id, status }: { id: string; status: "open" | "done" | "snoozed" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await fetch(`/api/followups/${id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              status: status === "done" ? "open" : "done",
            }),
          });
          if (r.ok) router.refresh();
        })
      }
      className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] disabled:opacity-50"
      style={{
        background: status === "done" ? "var(--sage)" : "transparent",
        borderColor: status === "done" ? "var(--sage)" : "var(--rule)",
      }}
      aria-label={status === "done" ? "Reopen" : "Mark done"}
    >
      {status === "done" && (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
          <path
            d="M3 8.5l3.5 3.5L13 5"
            stroke="var(--stone)"
            strokeWidth={2.5}
          />
        </svg>
      )}
    </button>
  );
}
