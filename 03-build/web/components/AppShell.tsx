/**
 * Standard authenticated app frame: TopBar + nav + content.
 *
 * Desktop (≥ md): TopBar + 64px IconNav left rail + main.
 * Mobile (< md): TopBar + main + sticky BottomTabNav.
 */
import { TopBar } from "./TopBar";
import { IconNav } from "./IconNav";
import { BottomTabNav } from "./BottomTabNav";
import { StalenessBanner } from "./StalenessBanner";
import { getCurrentUser } from "@/lib/auth";
import { getStalenessForUser } from "@/lib/staleness-fetch";

export async function AppShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  // Every page rendering AppShell is already behind the auth gate
  // (proxy.ts), so this is just a cheap lookup of the already-signed-in
  // user — not a second auth check.
  const user = await getCurrentUser();
  const { stale, reasons } = user
    ? await getStalenessForUser(user.id)
    : { stale: false, reasons: [] };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <StalenessBanner stale={stale} reasons={reasons} />
      <div className="flex flex-1 md:grid md:grid-cols-[64px_1fr]">
        <IconNav active={active} />
        <main className="flex-1">{children}</main>
      </div>
      <BottomTabNav active={active} />
    </div>
  );
}
