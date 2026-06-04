"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Tag } from "@/lib/tags/types";
import { TagChip } from "./TagChip";
import { TagPicker } from "./TagPicker";

const JSON_HEADERS = { "content-type": "application/json" };
type Window = "week" | "month" | "quarter";
const WINDOW_LABEL: Record<Window, string> = {
  week: "this week",
  month: "this month",
  quarter: "this quarter",
};

export interface TagGoal {
  tagId: string;
  tagName: string;
  targetCount: number;
  window: Window;
  reached: number;
}

/**
 * Per-tag outreach goals ("reach out to 1 volleyball friend a month"). Each
 * goal feeds the weekly Suggestions ranking when it's behind for the window.
 */
export function TagCadenceForm({
  tags,
  goals,
}: {
  tags: Tag[];
  goals: TagGoal[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);

  const colorOf = (tagId: string) =>
    tags.find((t) => t.id === tagId)?.color ?? null;

  const save = (tagId: string, targetCount: number, window: Window) =>
    start(async () => {
      await fetch("/api/tag-cadence", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ tagId, targetCount, window }),
      });
      router.refresh();
    });

  const addGoal = (tagId: string) => {
    setAdding(false);
    save(tagId, 1, "month");
  };

  const createAndAdd = async (name: string) => {
    setAdding(false);
    const r = await fetch("/api/tags", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const tag = await r.json();
      save(tag.id, 1, "month");
    }
  };

  if (tags.length === 0) {
    return (
      <p className="text-[13.5px]" style={{ color: "var(--ink-muted)" }}>
        Create tags on the{" "}
        <Link
          href="/settings/tags"
          style={{ color: "var(--brass-deep)", fontWeight: 500 }}
        >
          Tags page
        </Link>{" "}
        first, then set outreach goals here.
      </p>
    );
  }

  const goalTagIds = goals.map((g) => g.tagId);

  return (
    <div className="flex max-w-[560px] flex-col gap-3">
      {goals.length === 0 && (
        <p className="text-[13px]" style={{ color: "var(--ink-faint)" }}>
          No per-tag goals yet. Add one to nudge a tagged group into your weekly
          suggestions.
        </p>
      )}

      {goals.map((g) => {
        const met = g.reached >= g.targetCount;
        return (
          <div
            key={g.tagId}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-[var(--stone-raised)] px-3 py-2.5"
            style={{ borderColor: "var(--rule)" }}
          >
            <TagChip name={g.tagName} color={colorOf(g.tagId)} size="md" />
            <span className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
              Reach out to
            </span>
            <input
              type="number"
              min={1}
              max={20}
              defaultValue={g.targetCount}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n !== g.targetCount) save(g.tagId, n, g.window);
              }}
              className="w-16 rounded-md border bg-[var(--stone)] px-2 py-1 text-[14px] tabular-nums outline-none focus:border-[var(--brass)]"
              style={{ borderColor: "var(--rule)" }}
            />
            <select
              defaultValue={g.window}
              onChange={(e) =>
                save(g.tagId, g.targetCount, e.target.value as Window)
              }
              className="rounded-md border bg-[var(--stone)] px-2 py-1 text-[13.5px] outline-none focus:border-[var(--brass)]"
              style={{ borderColor: "var(--rule)" }}
            >
              <option value="week">per week</option>
              <option value="month">per month</option>
              <option value="quarter">per quarter</option>
            </select>
            <span
              className="text-[12px] tabular-nums"
              style={{ color: met ? "var(--fresh-green)" : "var(--ink-faint)" }}
            >
              {g.reached} of {g.targetCount} {WINDOW_LABEL[g.window]}
              {met ? " ✓" : ""}
            </span>
            <button
              type="button"
              onClick={() => save(g.tagId, 0, g.window)}
              aria-label={`Remove goal for ${g.tagName}`}
              className="ml-auto text-[12px] font-medium"
              style={{ color: "var(--ink-faint)" }}
            >
              Remove
            </button>
          </div>
        );
      })}

      {adding ? (
        <div className="flex items-center gap-2">
          <TagPicker
            tags={tags}
            selectedIds={goalTagIds}
            onPick={(t) => addGoal(t.id)}
            onCreate={createAndAdd}
            placeholder="Pick or create a tag for a goal…"
            autoFocus
            className="w-72"
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[12px] font-medium"
            style={{ color: "var(--ink-faint)" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setAdding(true)}
          className="self-start rounded-md border border-dashed px-3 py-1.5 text-[13px] font-medium hover:border-[var(--brass)] disabled:opacity-50"
          style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
        >
          + Add a goal
        </button>
      )}
    </div>
  );
}
