/**
 * Standard page content wrapper — centers content at a readable width with
 * the app's usual top/bottom/side padding. Used by every AppShell page that
 * doesn't need a wider layout (settings, triage, suggestions).
 */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-24 pt-6 md:px-14 md:pb-16 md:pt-8">
      {children}
    </div>
  );
}
