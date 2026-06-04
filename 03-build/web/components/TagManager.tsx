"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TagWithCount } from "@/lib/tags/types";
import { TAG_PALETTE, tagChipStyle } from "@/lib/tags/colors";
import { TagPicker } from "./TagPicker";

const JSON_HEADERS = { "content-type": "application/json" };

export function TagManager({ tags }: { tags: TagWithCount[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [recoloring, setRecoloring] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const refresh = () => start(() => router.refresh());

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch("/api/tags", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNewName("");
      refresh();
    }
  };

  const patch = async (id: string, body: { name?: string; color?: string }) => {
    await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    refresh();
  };

  const remove = async (t: TagWithCount) => {
    const ok = window.confirm(
      `Delete "${t.name}"? It will be removed from ${t.contactCount} contact${
        t.contactCount === 1 ? "" : "s"
      }. This can't be undone.`,
    );
    if (!ok) return;
    await fetch(`/api/tags/${t.id}`, { method: "DELETE" });
    refresh();
  };

  const merge = async (id: string, intoTagId: string) => {
    await fetch(`/api/tags/${id}/merge`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ intoTagId }),
    });
    setMerging(null);
    refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[480px] items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New tag name…"
          className="flex-1 rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[14px] outline-none focus:border-[var(--brass)]"
          style={{ borderColor: "var(--rule)" }}
        />
        <button
          onClick={create}
          disabled={pending || !newName.trim()}
          className="rounded-md border-0 bg-[var(--ink)] px-4 py-2 text-[13.5px] font-semibold text-[var(--stone)] disabled:opacity-50"
        >
          Add tag
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--ink-muted)" }}>
          No tags yet. Create one above, then apply it from a contact or by
          bulk-selecting on the Contacts page.
        </p>
      ) : (
        <ul className="flex flex-col">
          {tags.map((t) => {
            const swatch = tagChipStyle(t.color);
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 border-b py-3"
                style={{ borderColor: "var(--rule)" }}
              >
                <button
                  type="button"
                  aria-label={`Recolor ${t.name}`}
                  onClick={() =>
                    setRecoloring((r) => (r === t.id ? null : t.id))
                  }
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ background: t.color ?? "var(--ink-faint)" }}
                />

                {editing === t.id ? (
                  <input
                    autoFocus
                    defaultValue={t.name}
                    onBlur={(e) => {
                      setEditing(null);
                      if (e.target.value.trim() && e.target.value !== t.name) {
                        patch(t.id, { name: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border bg-[var(--stone-raised)] px-2 py-1 text-[14px] outline-none focus:border-[var(--brass)]"
                    style={{ borderColor: "var(--rule)" }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(t.id)}
                    className="min-w-0 flex-1 truncate text-left text-[14.5px] font-medium hover:underline"
                    style={{ color: swatch.color }}
                  >
                    {t.name}
                  </button>
                )}

                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t.contactCount} contact{t.contactCount === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setMerging((m) => (m === t.id ? null : t.id))}
                  className="rounded-md border px-2.5 py-1 text-[12px] font-medium hover:border-[var(--brass)]"
                  style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
                >
                  Merge
                </button>
                <button
                  type="button"
                  onClick={() => remove(t)}
                  className="rounded-md border px-2.5 py-1 text-[12px] font-medium hover:border-[var(--cold-red)] hover:text-[var(--cold-red)]"
                  style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
                >
                  Delete
                </button>

                {recoloring === t.id && (
                  <div className="flex w-full flex-wrap gap-1.5 pl-8">
                    {TAG_PALETTE.map((hue) => (
                      <button
                        key={hue}
                        type="button"
                        aria-label={`Set color ${hue}`}
                        onClick={() => {
                          setRecoloring(null);
                          patch(t.id, { color: hue });
                        }}
                        className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10"
                        style={{
                          background: hue,
                          outline:
                            t.color === hue ? "2px solid var(--brass)" : undefined,
                          outlineOffset: 1,
                        }}
                      />
                    ))}
                  </div>
                )}

                {merging === t.id && (
                  <div className="w-full pl-8">
                    <p
                      className="mb-1 text-[12px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      Merge “{t.name}” into…
                    </p>
                    <TagPicker
                      tags={tags.filter((x) => x.id !== t.id)}
                      allowCreate={false}
                      placeholder="Pick a tag to merge into…"
                      onPick={(target) => merge(t.id, target.id)}
                      onCreate={() => {}}
                      className="max-w-[320px]"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
