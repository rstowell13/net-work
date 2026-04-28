"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AddToWeekButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          setMsg(null);
          const r = await fetch(
            `/api/contacts/${contactId}/add-to-week`,
            { method: "POST" },
          );
          if (r.ok) {
            const j = await r.json();
            setMsg(j.added > 0 ? "Added to this week" : "Already in plan");
            router.refresh();
            setTimeout(() => setMsg(null), 2500);
          } else {
            setMsg("Error");
          }
        })
      }
      className="inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
      style={{
        background: "var(--ink)",
        color: "var(--stone)",
        borderColor: "var(--ink)",
      }}
    >
      {pending ? "Adding…" : msg ?? "+ Add to this week"}
    </button>
  );
}
