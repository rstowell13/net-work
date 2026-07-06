import { AppShell } from "@/components/AppShell";
import { SearchHitList } from "@/components/SearchHitList";
import { requireUser } from "@/lib/auth";
import { searchAll } from "@/lib/search/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results =
    query.length >= 2
      ? await searchAll(user.id, query, { contacts: 25, tags: 25, mentions: 40 })
      : { contacts: [], tags: [], mentions: [] };
  const total =
    results.contacts.length + results.tags.length + results.mentions.length;

  return (
    <AppShell active="/search">
      <main className="px-4 pb-24 pt-6 md:px-10 md:pb-16 md:pt-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="serif-display m-0 text-[32px] leading-none md:text-[36px]">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search"}
          </h1>
          {query.length >= 2 && (
            <p
              className="shrink-0 text-[12.5px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {total} {total === 1 ? "result" : "results"}
            </p>
          )}
        </div>

        {query.length < 2 ? (
          <Hint>Type at least 2 characters to search.</Hint>
        ) : total === 0 ? (
          <Hint>No matches for &ldquo;{query}&rdquo;. Try a different spelling or term.</Hint>
        ) : (
          <div className="flex max-w-2xl flex-col gap-8">
            <SearchHitList results={results} density="comfortable" />
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-[14px]" style={{ color: "var(--ink-faint)" }}>
      {children}
    </p>
  );
}
