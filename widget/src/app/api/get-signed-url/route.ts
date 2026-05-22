/**
 * Mint a single-use ElevenLabs Conversational-AI signed URL.
 *
 * New-architecture note: there is NO MascotBot endpoint in this path.
 * The legacy widget proxied through api.mascot.bot so the server could
 * inject visemes into the audio stream. The 0.2.x SDK computes visemes
 * locally in the browser from the audio ElevenLabs already plays, so the
 * server only needs to hand the browser a plain ElevenLabs signed URL.
 * The standing xi-api-key never leaves the server.
 *
 * The continuity resume path POSTs an optional `dynamicVariables` body so
 * its call signature is unchanged. ElevenLabs' get-signed-url endpoint
 * does not accept dynamic variables server-side — they are applied
 * client-side via Conversation.startSession({ dynamicVariables }). We
 * accept and ignore the body here purely for caller compatibility.
 *
 * Env: ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Drain the optional body so the resume-path caller's POST succeeds even
  // though dynamic variables are applied client-side, not here.
  await request.json().catch(() => ({}));

  const key = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agentId) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set" },
      { status: 400 },
    );
  }

  const url = new URL(
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
  );
  url.searchParams.set("agent_id", agentId);

  const res = await fetch(url, {
    headers: { "xi-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("ElevenLabs signed-url failed:", res.status, detail);
    return NextResponse.json(
      { error: `ElevenLabs ${res.status}`, detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const json = (await res.json()) as { signed_url?: string };
  return NextResponse.json({ signedUrl: json.signed_url });
}
