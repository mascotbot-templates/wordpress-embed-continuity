import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dynamicVariables } = body as {
      dynamicVariables?: Record<string, string | number | boolean>;
    };

    const response = await fetch("https://api.mascot.bot/v1/get-signed-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MASCOT_BOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          provider: "elevenlabs",
          provider_config: {
            agent_id: process.env.ELEVENLABS_AGENT_ID,
            api_key: process.env.ELEVENLABS_API_KEY,
            ...(dynamicVariables && { dynamic_variables: dynamicVariables }),
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to get signed URL:", errorText);
      return NextResponse.json(
        { error: "Failed to generate signed URL" },
        { status: 500 },
      );
    }

    const data = await response.json();
    return NextResponse.json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error("Error fetching signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
