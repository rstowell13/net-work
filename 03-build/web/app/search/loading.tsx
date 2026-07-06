import { AppShellStatic } from "@/components/AppShell";

export default function SearchLoading() {
  return (
    <AppShellStatic active="/search">
      <main className="px-4 pb-24 pt-6 md:px-10 md:pb-16 md:pt-8">
        <h1 className="serif-display m-0 mb-6 text-[32px] leading-none md:text-[36px]">
          Search
        </h1>
        <p className="py-10 text-center text-[14px]" style={{ color: "var(--ink-faint)" }}>
          Searching…
        </p>
      </main>
    </AppShellStatic>
  );
}
