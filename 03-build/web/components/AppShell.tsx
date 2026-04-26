/**
 * Standard authenticated app frame: TopBar + IconNav + content.
 * All authenticated pages render their content as `children` here.
 */
import { TopBar } from "./TopBar";
import { IconNav } from "./IconNav";

export function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "64px 1fr",
          minHeight: "calc(100dvh - 60px)",
        }}
      >
        <IconNav active={active} />
        <main>{children}</main>
      </div>
    </>
  );
}
