import { AppShellStatic } from "@/components/AppShell";

export default function HomeLoading() {
  return (
    <AppShellStatic active="/">
      <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-6 md:px-14 md:pt-8">
        <p className="py-10 text-center text-[14px]" style={{ color: "var(--ink-faint)" }}>
          Loading…
        </p>
      </div>
    </AppShellStatic>
  );
}
