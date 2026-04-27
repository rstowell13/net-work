/**
 * Issue a fresh Mac-agent install token. Plaintext is shown to the user
 * exactly once (returned in the response body) — only the SHA-256 is
 * stored.
 *
 * Returns the full one-line install command, with the token + base URL
 * pre-templated, ready to paste into Terminal.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { issueAgentToken } from "@/lib/agent-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  const { plaintext } = await issueAgentToken({ userId: user.id });

  // Resolve the public origin from the incoming request URL.
  const origin = new URL(request.url).origin;

  const installerUrl =
    "https://raw.githubusercontent.com/rstowell13/net-work/main/03-build/mac-agent/installer.sh";
  const command = `curl -fsSL ${installerUrl} | NETWORK_AGENT_TOKEN=${plaintext} NETWORK_API_BASE=${origin} bash`;

  return NextResponse.json({ command, plaintext });
}
