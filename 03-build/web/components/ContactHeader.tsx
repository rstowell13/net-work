import { Avatar } from "@/components/Avatar";
import { FreshnessRing } from "@/components/FreshnessRing";
import { bandColor, bandLabel, type FreshnessResult } from "@/lib/scoring/freshness";

/**
 * Shared avatar + serif-italic name + freshness ring/band header, used by
 * TriageCard and SuggestionsFlow. One responsive component (CSS breakpoints
 * switch mobile-stacked vs desktop 3-column layout) rather than two
 * hand-duplicated DOM blocks.
 *
 * The two call sites render different "meta" content under the name
 * (source chips vs category+reason+tags), so that part is a children slot.
 * Sizing/typography here is TriageCard's — the canonical variant per the
 * P8 consolidation (SuggestionsFlow had drifted: smaller font-size, and
 * was missing `fontVariationSettings: "'opsz' 96"`).
 */
export function ContactHeader({
  id,
  name,
  photoUrl,
  freshness,
  meta,
}: {
  id: string;
  name: string;
  photoUrl: string | null;
  freshness: FreshnessResult;
  meta: React.ReactNode;
}) {
  return (
    <>
      {/* Mobile header: avatar + ring on row 1, name + meta on row 2 */}
      <header className="mb-6 md:hidden">
        <div className="flex items-center justify-between gap-4">
          <Avatar id={id} name={name} photoUrl={photoUrl} size="lg" />
          <div className="flex flex-col items-center gap-1.5">
            <FreshnessRing result={freshness} size="md" />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: bandColor(freshness.band) }}
            >
              {bandLabel(freshness.band)}
            </span>
          </div>
        </div>
        <h1
          className="m-0 mt-4 break-words"
          style={{
            fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(30px, 8.5vw, 44px)",
            lineHeight: 0.98,
            letterSpacing: "-0.022em",
            fontVariationSettings: "'opsz' 96",
          }}
        >
          {name}
        </h1>
        {meta}
      </header>

      {/* Desktop header — original 3-column layout */}
      <header
        className="mb-7 hidden items-start gap-6 md:grid"
        style={{ gridTemplateColumns: "96px 1fr auto" }}
      >
        <Avatar id={id} name={name} photoUrl={photoUrl} size="xl" />
        <div>
          <h1
            className="m-0 mb-2.5"
            style={{
              fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 48,
              lineHeight: 0.98,
              letterSpacing: "-0.022em",
              fontVariationSettings: "'opsz' 96",
            }}
          >
            {name}
          </h1>
          {meta}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <FreshnessRing result={freshness} size="md" />
          <span
            className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: bandColor(freshness.band) }}
          >
            {bandLabel(freshness.band)}
          </span>
        </div>
      </header>
    </>
  );
}
