"use client";
/**
 * Global search — the live half of the search feature.
 *
 * variant="bar"     desktop inline search bar + dropdown preview.
 * variant="trigger" mobile search icon that opens a full-screen overlay.
 *
 * Both share one search hook: type → debounced fetch of /api/search → a
 * grouped preview (People / Tags / Mentions). Enter (with no row highlighted)
 * goes to the full /search results page; ↑/↓ move between rows; Esc closes;
 * "/" focuses the desktop bar from anywhere.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { TagChip } from "./TagChip";
import type {
  MentionSource,
  SearchResults,
} from "@/lib/search/queries";
import { formatPhoneDisplay } from "@/lib/phone-format";

const EMPTY: SearchResults = { contacts: [], tags: [], mentions: [] };

const SOURCE_LABEL: Record<MentionSource, string> = {
  note: "Note",
  email: "Email",
  message: "Message",
  summary: "Summary",
  event: "Event",
};

function hrefForContact(id: string) {
  return `/contacts/${id}`;
}
function hrefForTag(id: string) {
  return `/contacts?tags=${id}`;
}
function hrefForSearch(q: string) {
  return `/search?q=${encodeURIComponent(q.trim())}`;
}

/**
 * Debounced fetch against /api/search, race-guarded so stale responses lose.
 * Every state update happens inside the timer callback (never synchronously in
 * the effect body) so we don't trigger cascading renders.
 */
function useSearch(q: string) {
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    let active = true;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      if (query.length < 2) {
        if (active) {
          setResults(EMPTY);
          setLoading(false);
        }
        return;
      }
      if (active) setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchResults;
        if (active) setResults(data);
      } catch (err) {
        if (active && !(err instanceof DOMException && err.name === "AbortError")) {
          setResults(EMPTY);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, query.length < 2 ? 0 : 175);

    return () => {
      active = false;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  return { results, loading };
}

export function GlobalSearch({ variant }: { variant: "bar" | "trigger" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false); // desktop dropdown visibility
  const [overlayOpen, setOverlayOpen] = useState(false); // mobile overlay
  const [active, setActive] = useState(-1); // highlighted row, -1 = none

  const { results, loading } = useSearch(q);
  const containerRef = useRef<HTMLDivElement>(null);
  const barInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  // Flat, ordered list of row destinations for ↑/↓ + Enter.
  const navHrefs = useMemo(() => {
    const hrefs: string[] = [];
    for (const c of results.contacts) hrefs.push(hrefForContact(c.id));
    for (const t of results.tags) hrefs.push(hrefForTag(t.id));
    for (const m of results.mentions) hrefs.push(hrefForContact(m.contactId));
    return hrefs;
  }, [results]);

  // Typing always clears any highlighted row (the result set is about to change).
  function onChange(value: string) {
    setQ(value);
    setActive(-1);
  }

  function close() {
    setOpen(false);
    setOverlayOpen(false);
    setActive(-1);
    setQ("");
  }

  function navigate(href: string) {
    router.push(href);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(navHrefs.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && navHrefs[active]) navigate(navHrefs[active]);
      else if (q.trim().length >= 2) navigate(hrefForSearch(q));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (variant === "trigger") setOverlayOpen(false);
      else setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  // Desktop: "/" focuses the bar from anywhere it isn't already typing.
  useEffect(() => {
    if (variant !== "bar") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      barInputRef.current?.focus();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  // Desktop: click outside closes the dropdown.
  useEffect(() => {
    if (variant !== "bar" || !open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [variant, open]);

  // Mobile: lock body scroll + autofocus while the overlay is open.
  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => overlayInputRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [overlayOpen]);

  const panel = (
    <ResultsPanel
      results={results}
      loading={loading}
      query={q}
      active={active}
      onHover={setActive}
      onSelect={navigate}
      onSeeAll={() => q.trim().length >= 2 && navigate(hrefForSearch(q))}
    />
  );

  // ── Mobile trigger + overlay ──────────────────────────────────────────────
  if (variant === "trigger") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          aria-label="Search"
          className="flex h-10 w-10 items-center justify-center rounded-[7px] border md:hidden"
          style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
        >
          <SearchIcon />
        </button>

        {overlayOpen && (
          <div
            className="fixed inset-0 z-[60] flex flex-col md:hidden"
            style={{ background: "var(--stone)" }}
          >
            <div
              className="flex items-center gap-2 border-b px-3 py-3"
              style={{ borderColor: "var(--rule)" }}
            >
              <div
                className="flex flex-1 items-center gap-2 rounded-[10px] border px-3 py-2.5"
                style={{
                  background: "var(--stone-raised)",
                  borderColor: "var(--rule)",
                }}
              >
                <SearchIcon faint />
                <input
                  ref={overlayInputRef}
                  value={q}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search contacts, tags, or notes"
                  enterKeyHint="search"
                  autoComplete="off"
                  aria-label="Search"
                  className="flex-1 border-0 bg-transparent text-base outline-none placeholder:text-[color:var(--ink-faint)]"
                  style={{ color: "var(--ink)" }}
                />
              </div>
              <button
                type="button"
                onClick={() => setOverlayOpen(false)}
                aria-label="Close search"
                className="flex h-10 w-10 items-center justify-center rounded-[7px]"
                style={{ color: "var(--ink-muted)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{panel}</div>
          </div>
        )}
      </>
    );
  }

  // ── Desktop inline bar ────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative hidden w-full md:block">
      <div
        className="flex w-full items-center gap-2 rounded-[10px] border px-4 py-[9px]"
        style={{ background: "var(--stone-raised)", borderColor: "var(--rule)" }}
      >
        <SearchIcon faint />
        <input
          ref={barInputRef}
          value={q}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search contacts, tags, or notes"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search"
          className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--ink-faint)]"
          style={{ color: "var(--ink)" }}
        />
        <span
          className="rounded px-1.5 py-px font-mono text-[10.5px]"
          style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
        >
          /
        </span>
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-[10px] border shadow-lg"
          style={{
            background: "var(--stone-raised)",
            borderColor: "var(--rule)",
          }}
        >
          {panel}
        </div>
      )}
    </div>
  );
}

// ── Shared results rendering ─────────────────────────────────────────────────

function ResultsPanel({
  results,
  loading,
  query,
  active,
  onHover,
  onSelect,
  onSeeAll,
}: {
  results: SearchResults;
  loading: boolean;
  query: string;
  active: number;
  onHover: (i: number) => void;
  onSelect: (href: string) => void;
  onSeeAll: () => void;
}) {
  const { contacts, tags, mentions } = results;
  const empty = contacts.length === 0 && tags.length === 0 && mentions.length === 0;
  const tagsStart = contacts.length;
  const mentionsStart = contacts.length + tags.length;

  if (empty) {
    return (
      <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--ink-faint)" }}>
        {loading ? "Searching…" : `No matches for "${query.trim()}"`}
      </div>
    );
  }

  return (
    <div className="py-2">
      {contacts.length > 0 && (
        <Group label="People">
          {contacts.map((c, i) => (
            <Row
              key={c.id}
              index={i}
              active={active === i}
              onHover={onHover}
              onSelect={() => onSelect(hrefForContact(c.id))}
            >
              <Avatar id={c.id} name={c.displayName} photoUrl={c.photoUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]" style={{ color: "var(--ink)" }}>
                  {c.displayName}
                </span>
                {(c.matchedOn === "email" || c.matchedOn === "phone") && (
                  <span className="block truncate text-[12px]" style={{ color: "var(--ink-faint)" }}>
                    {c.matchedOn === "email"
                      ? c.primaryEmail
                      : formatPhoneDisplay(c.primaryPhone)}
                  </span>
                )}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {tags.length > 0 && (
        <Group label="Tags">
          {tags.map((t, i) => (
            <Row
              key={t.id}
              index={tagsStart + i}
              active={active === tagsStart + i}
              onHover={onHover}
              onSelect={() => onSelect(hrefForTag(t.id))}
            >
              <TagChip name={t.name} color={t.color} />
              <span className="flex-1 text-right text-[12px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
                {t.contactCount} {t.contactCount === 1 ? "contact" : "contacts"}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {mentions.length > 0 && (
        <Group label="Mentions">
          {mentions.map((m, i) => (
            <Row
              key={`${m.contactId}-${i}`}
              index={mentionsStart + i}
              active={active === mentionsStart + i}
              onHover={onHover}
              onSelect={() => onSelect(hrefForContact(m.contactId))}
            >
              <Avatar id={m.contactId} name={m.displayName} photoUrl={m.photoUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]" style={{ color: "var(--ink)" }}>
                  {m.displayName}
                </span>
                <span className="block truncate text-[12px]" style={{ color: "var(--ink-muted)" }}>
                  {m.snippet}
                </span>
              </span>
              <SourcePill source={m.source} />
            </Row>
          ))}
        </Group>
      )}

      {query.trim().length >= 2 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-1 flex w-full items-center justify-between border-t px-4 py-2.5 text-[12.5px]"
          style={{ borderColor: "var(--rule)", color: "var(--ink-muted)" }}
        >
          <span>See all results</span>
          <span
            className="rounded px-1.5 py-px font-mono text-[10.5px]"
            style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
          >
            ↵
          </span>
        </button>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 pb-1">
      <p
        className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--ink-faint)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  index,
  active,
  onHover,
  onSelect,
  children,
}: {
  index: number;
  active: boolean;
  onHover: (i: number) => void;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(index)}
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left"
      style={{ background: active ? "var(--brass-soft)" : undefined }}
    >
      {children}
    </button>
  );
}

function SourcePill({ source }: { source: MentionSource }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function SearchIcon({ faint }: { faint?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="h-4 w-4 shrink-0"
      style={{ color: faint ? "var(--ink-faint)" : "currentColor" }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
