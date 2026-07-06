/**
 * Pure survivor ranking — no DB / no server-only deps so it can be
 * unit-tested and imported anywhere (same pattern as promote-criteria.ts /
 * rebuild-phase.ts). survivor.ts wraps this with the DB I/O.
 */

// Survivor selection: a human's "kept" decision must outrank an untriaged or
// skipped record.
const TRIAGE_RANK: Record<string, number> = {
  kept: 3,
  to_triage: 2,
  skipped: 1,
};

/**
 * Pure survivor ranking: kept > to_triage > skipped, then has-category, then
 * most raw records, then oldest. Returns null for an empty list.
 */
export function rankSurvivorId(
  rows: {
    id: string;
    triageStatus: string;
    category: string | null;
    createdAt: Date;
  }[],
  rawCountById: Map<string, number>,
): string | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const ta = TRIAGE_RANK[a.triageStatus] ?? 0;
    const tb = TRIAGE_RANK[b.triageStatus] ?? 0;
    if (tb !== ta) return tb - ta;
    const ca = a.category ? 1 : 0;
    const cb = b.category ? 1 : 0;
    if (cb !== ca) return cb - ca;
    const na = rawCountById.get(a.id) ?? 0;
    const nb = rawCountById.get(b.id) ?? 0;
    if (nb !== na) return nb - na;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return ranked[0].id;
}
