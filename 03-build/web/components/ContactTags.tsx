"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tag } from "@/lib/tags/types";
import { TagChip } from "./TagChip";
import { TagPicker } from "./TagPicker";

/**
 * Inline tag editor for the contact detail page: chips with × to remove, and a
 * "+ Tag" button that opens the search-or-create picker. Optimistic local state
 * keeps it snappy; router.refresh() syncs server-derived bits.
 */
export function ContactTags({
  contactId,
  initial,
  allTags,
}: {
  contactId: string;
  initial: Tag[];
  allTags: Tag[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initial);
  const [available, setAvailable] = useState<Tag[]>(allTags);
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const refresh = () => start(() => router.refresh());

  const add = async (tag: Tag) => {
    setTags((t) => (t.some((x) => x.id === tag.id) ? t : [...t, tag]));
    await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    refresh();
  };

  const remove = async (tagId: string) => {
    setTags((t) => t.filter((x) => x.id !== tagId));
    await fetch(`/api/contacts/${contactId}/tags`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    refresh();
  };

  const create = async (name: string) => {
    const r = await fetch(`/api/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) return;
    const tag = (await r.json()) as Tag;
    setAvailable((a) => (a.some((x) => x.id === tag.id) ? a : [...a, tag]));
    await add(tag);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip
          key={t.id}
          name={t.name}
          color={t.color}
          onRemove={() => remove(t.id)}
        />
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-2">
          <TagPicker
            tags={available}
            selectedIds={tags.map((t) => t.id)}
            onPick={add}
            onCreate={create}
            autoFocus
            className="w-56"
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[12px] font-medium"
            style={{ color: "var(--ink-faint)" }}
          >
            Done
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[11px] font-medium hover:border-[var(--brass)]"
          style={{ borderColor: "var(--rule)", color: "var(--ink-faint)" }}
        >
          + Tag
        </button>
      )}
    </div>
  );
}
