"use client";
import { useId, useMemo, useRef, useState } from "react";
import type { Tag } from "@/lib/tags/types";
import { normalizeTagName, tagChipStyle } from "@/lib/tags/colors";

/**
 * Type-to-search-or-create combobox (Gmail/Notion-style). Filters existing
 * tags as you type and offers "Create '<query>'" when nothing matches exactly.
 * Stays dumb: the parent handles minting (onCreate) and assignment (onPick).
 */
export function TagPicker({
  tags,
  selectedIds = [],
  onPick,
  onCreate,
  excludeSelected = true,
  allowCreate = true,
  placeholder = "Search or create a tag…",
  autoFocus = false,
  className = "",
}: {
  tags: Tag[];
  selectedIds?: string[];
  onPick: (tag: Tag) => void;
  onCreate: (name: string) => void;
  excludeSelected?: boolean;
  allowCreate?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const norm = normalizeTagName(query);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = norm.toLowerCase();
    return tags
      .filter((t) => !(excludeSelected && selected.has(t.id)))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [tags, norm, selected, excludeSelected]);

  const exactMatch = tags.some(
    (t) => t.name.toLowerCase() === norm.toLowerCase(),
  );
  const showCreate = allowCreate && norm.length > 0 && !exactMatch;
  const optionCount = filtered.length + (showCreate ? 1 : 0);

  const choose = (i: number) => {
    if (showCreate && i === filtered.length) {
      onCreate(norm);
    } else if (filtered[i]) {
      onPick(filtered[i]);
    } else {
      return;
    }
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, optionCount - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (optionCount > 0) choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // delay so a click on an option still registers
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border bg-[var(--stone-raised)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--brass)]"
        style={{ borderColor: "var(--rule)" }}
      />
      {open && optionCount > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-[var(--stone-raised)] py-1 shadow-lg"
          style={{ borderColor: "var(--rule)" }}
          onMouseDown={(e) => {
            // keep focus so onBlur doesn't close before click handler runs
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {filtered.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13.5px]"
              style={{
                background: i === active ? "var(--stone-sunken)" : undefined,
              }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: tagChipStyle(t.color).color,
                }}
              />
              <span className="truncate">{t.name}</span>
            </li>
          ))}
          {showCreate && (
            <li
              role="option"
              aria-selected={active === filtered.length}
              onMouseEnter={() => setActive(filtered.length)}
              onClick={() => choose(filtered.length)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13.5px]"
              style={{
                background:
                  active === filtered.length ? "var(--stone-sunken)" : undefined,
                color: "var(--ink-muted)",
              }}
            >
              <span className="text-[15px] leading-none" aria-hidden>
                +
              </span>
              Create <strong className="font-semibold">“{norm}”</strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
