/**
 * Standard authenticated app frame: TopBar + nav + content.
 *
 * Desktop (≥ md): TopBar + 64px IconNav left rail + main.
 * Mobile (< md): TopBar + main + sticky BottomTabNav.
 */
import { TopBar } from "./TopBar";
import { IconNav } from "./IconNav";
import { BottomTabNav } from "./BottomTabNav";

export function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <div className="flex flex-1 md:grid md:grid-cols-[64px_1fr]">
        <IconNav active={active} />
        <main className="flex-1">{children}</main>
      </div>
      <BottomTabNav active={active} />
    </div>
  );
}
