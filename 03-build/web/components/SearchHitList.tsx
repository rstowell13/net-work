import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { TagChip } from "@/components/TagChip";
import { SOURCE_LABEL } from "@/lib/search/labels";
import { formatPhoneDisplay } from "@/lib/phone-format";
import type { SearchResults } from "@/lib/search/queries";

/**
 * Shared People/Tags/Mentions rendering for the same `searchAll` result
 * shape, used by both the full /search results page and GlobalSearch's live
 * preview dropdown/overlay. Fetch, debounce, keyboard nav, and open/close
 * overlay logic stay in GlobalSearch — this only renders rows.
 *
 * `density`:
 *   - "comfortable" — the full-page layout: md avatars, Link-based rows,
 *     always shows the contact's primary email, shows mention matchCount.
 *   - "compact" — the live-preview layout: sm avatars, index-addressable
 *     rows for keyboard nav + hover/active highlight, only shows a
 *     contact's secondary line when that's what matched the query.
 */
export function SearchHitList({
  results,
  density,
  active = -1,
  onHover,
  onSelect,
}: {
  results: SearchResults;
  density: "comfortable" | "compact";
  /** compact only: index of the keyboard/mouse-highlighted row. */
  active?: number;
  /** compact only: called on row hover with its flat index. */
  onHover?: (index: number) => void;
  /** compact only: called with the row's href on click. */
  onSelect?: (href: string) => void;
}) {
  const { contacts, tags, mentions } = results;
  const avatarSize = density === "comfortable" ? "md" : "sm";
  const tagsStart = contacts.length;
  const mentionsStart = contacts.length + tags.length;

  return (
    <>
      {contacts.length > 0 && (
        <Group label="People" density={density}>
          {contacts.map((c, i) => (
            <RowShell
              key={c.id}
              density={density}
              href={`/contacts/${c.id}`}
              index={i}
              active={active === i}
              onHover={onHover}
              onSelect={onSelect}
            >
              <Avatar id={c.id} name={c.displayName} photoUrl={c.photoUrl} size={avatarSize} />
              <span className="min-w-0 flex-1">
                <span
                  className={
                    density === "comfortable"
                      ? "block truncate text-[15px]"
                      : "block truncate text-[13.5px]"
                  }
                  style={{ color: "var(--ink)" }}
                >
                  {c.displayName}
                </span>
                {density === "comfortable"
                  ? c.primaryEmail && (
                      <span
                        className="block truncate text-[12.5px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {c.primaryEmail}
                      </span>
                    )
                  : (c.matchedOn === "email" || c.matchedOn === "phone") && (
                      <span
                        className="block truncate text-[12px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {c.matchedOn === "email"
                          ? c.primaryEmail
                          : formatPhoneDisplay(c.primaryPhone)}
                      </span>
                    )}
              </span>
            </RowShell>
          ))}
        </Group>
      )}

      {tags.length > 0 && (
        <Group label="Tags" density={density}>
          {tags.map((t, i) => (
            <RowShell
              key={t.id}
              density={density}
              href={`/contacts?tags=${t.id}`}
              index={tagsStart + i}
              active={active === tagsStart + i}
              onHover={onHover}
              onSelect={onSelect}
            >
              <TagChip name={t.name} color={t.color} size={density === "comfortable" ? "md" : "sm"} />
              <span
                className={
                  density === "comfortable"
                    ? "flex-1 text-right text-[12.5px] tabular-nums"
                    : "flex-1 text-right text-[12px] tabular-nums"
                }
                style={{ color: "var(--ink-faint)" }}
              >
                {t.contactCount} {t.contactCount === 1 ? "contact" : "contacts"}
              </span>
            </RowShell>
          ))}
        </Group>
      )}

      {mentions.length > 0 && (
        <Group label="Mentions" density={density}>
          {mentions.map((m, i) => (
            <RowShell
              key={density === "comfortable" ? m.contactId : `${m.contactId}-${i}`}
              density={density}
              href={`/contacts/${m.contactId}`}
              index={mentionsStart + i}
              active={active === mentionsStart + i}
              onHover={onHover}
              onSelect={onSelect}
            >
              <Avatar id={m.contactId} name={m.displayName} photoUrl={m.photoUrl} size={avatarSize} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={
                      density === "comfortable"
                        ? "truncate text-[15px]"
                        : "block truncate text-[13.5px]"
                    }
                    style={{ color: "var(--ink)" }}
                  >
                    {m.displayName}
                  </span>
                  {density === "comfortable" && m.matchCount > 1 && (
                    <span className="shrink-0 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                      {m.matchCount} matches
                    </span>
                  )}
                </span>
                <span
                  className={
                    density === "comfortable"
                      ? "block truncate text-[12.5px]"
                      : "block truncate text-[12px]"
                  }
                  style={{ color: "var(--ink-muted)" }}
                >
                  {m.snippet}
                </span>
              </span>
              {density === "comfortable" ? (
                <span
                  className="shrink-0 self-start rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
                >
                  {SOURCE_LABEL[m.source]}
                </span>
              ) : (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{ background: "var(--stone-sunken)", color: "var(--ink-muted)" }}
                >
                  {SOURCE_LABEL[m.source]}
                </span>
              )}
            </RowShell>
          ))}
        </Group>
      )}
    </>
  );
}

function Group({
  label,
  density,
  children,
}: {
  label: string;
  density: "comfortable" | "compact";
  children: React.ReactNode;
}) {
  if (density === "comfortable") {
    return (
      <section>
        <h2
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-faint)" }}
        >
          {label}
        </h2>
        <div className="flex flex-col">{children}</div>
      </section>
    );
  }
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

/**
 * comfortable: a Link-wrapped row (full-page results, no keyboard nav).
 * compact: a button row addressable by flat index, for GlobalSearch's
 * hover/active highlight + arrow-key navigation.
 */
function RowShell({
  density,
  href,
  index,
  active,
  onHover,
  onSelect,
  children,
}: {
  density: "comfortable" | "compact";
  href: string;
  index: number;
  active?: boolean;
  onHover?: (index: number) => void;
  onSelect?: (href: string) => void;
  children: React.ReactNode;
}) {
  if (density === "comfortable") {
    return (
      <Link href={href} className="block">
        <span className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-[var(--stone-raised)]">
          {children}
        </span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onMouseEnter={() => onHover?.(index)}
      onClick={() => onSelect?.(href)}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left"
      style={{ background: active ? "var(--brass-soft)" : undefined }}
    >
      {children}
    </button>
  );
}
