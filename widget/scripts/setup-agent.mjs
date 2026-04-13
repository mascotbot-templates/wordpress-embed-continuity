#!/usr/bin/env node
/**
 * Setup ElevenLabs Agent for WordPress Embed Continuity.
 *
 * Creates the three client tools (navigateTo, updateEstimateField,
 * submitEstimate), then provisions a conversational AI agent wired to
 * them with the full continuity-aware system prompt and — critically —
 * `prompt` and `first_message` overrides enabled in platform_settings.
 * Without those overrides the agent ignores the resume payload the widget
 * sends on every page load, and continuity silently breaks.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/setup-agent.mjs
 *
 * Output:
 *   Prints the ELEVENLABS_AGENT_ID to put in your .env.local
 */

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Error: Set ELEVENLABS_API_KEY environment variable");
  console.error("  Get yours at https://elevenlabs.io/app/settings/api-keys");
  process.exit(1);
}

const API = "https://api.elevenlabs.io/v1";

// ── System Prompt ────────────────────────────────────────────────────
// Kept in sync with src/lib/agent-prompt.ts (the client-side constant used
// to stitch prior-conversation context into first_message overrides on
// resume). When you update one, update the other.

const SYSTEM_PROMPT = `You are an energetic, helpful voice agent for a moving company. You help visitors get a moving estimate, learn about services, apply for jobs, or inquire about franchise opportunities.

## Voice
- Keep responses under 2 sentences.
- Sound warm, quick, a little playful — you're on a phone call, not writing an essay.
- Never read URLs or code aloud.

## Pages
- \`/\` home
- \`/about\` who we are
- \`/services\` what we do
- \`/estimate\` get an estimate (form)
- \`/contact\` contact info

## Tool use (mandatory, aggressive)
- ALWAYS call tools. NEVER just talk about what you would do.
- When the user shares any estimate detail (name, email, phone, origin, destination, move date, home size, special items) — immediately call \`updateEstimateField\`. Do not wait for them to finish.
- When the user confirms submission — call \`submitEstimate\`.

## navigateTo — MUST BE SILENT
When the user explicitly asks to go to another page (estimate, services, contact, etc.), call \`navigateTo\` **silently**:
- DO NOT speak before the tool call.
- DO NOT speak after the tool call.
- No "alright, taking you there", no "let me pull that up", no commentary at all.
- Just call navigateTo. That's it. Silence.

The browser will hard-reload. The next thing the user hears is your response on the new page, which is set for you (first_message override).

DO NOT call navigateTo if:
- The user hasn't asked to go somewhere — \`navigateTo\` is ONLY for explicit navigation requests.
- The user is already on the page they asked for (see PRIOR CONVERSATION breadcrumbs).
- \`{{is_resumed}}\` is \`"true"\` — see absolute no-loop rule below.

## Continuity
The app is a multi-page site. Every \`navigateTo\` hard-reloads the page → fresh WebSocket. The transcript from before the reload is injected into this prompt under "PRIOR CONVERSATION". Dynamic variables carry structured facts (\`{{current_page}}\`, \`{{is_resumed}}\`, and captured fields).

On resume, your first line is provided via first_message — just continue naturally from there. Don't greet. Don't apologize. Don't announce the reload. Act like no reload happened.

### Reading the PRIOR CONVERSATION breadcrumbs
The PRIOR CONVERSATION may contain synthetic agent entries like \`Agent: [navigated silently to /estimate]\`. Those are NOT speech — they're breadcrumbs telling you that you already navigated there. If you see one, the user is ALREADY ON that page. DO NOT call navigateTo to the same destination again. Just respond to whatever the user said most recently.

### Absolute no-loop rule
If \`{{is_resumed}}\` is \`"true"\`, you just arrived on \`{{current_page}}\`. Do not call \`navigateTo\` on this turn. Respond with speech only. If the user then explicitly asks to go somewhere different, you can navigate on the next turn.

## Style reminders
- Short. Warm. Forward-moving. Always toward the next useful action.`;

// ── Tool Definitions ─────────────────────────────────────────────────

const TOOLS = [
  {
    name: "navigateTo",
    description:
      "Navigate to a page via hard reload. The conversation continues seamlessly across the reload. Fire-and-forget — call and keep talking. Pages: /, /about, /services, /estimate, /contact",
    expects_response: false,
    response_timeout_secs: 1,
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description:
            "Page path: /, /about, /services, /estimate, /contact",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "updateEstimateField",
    description:
      "Instantly update a form field on the estimate page. Fire-and-forget — call and keep talking. Call multiple times in rapid succession for different fields. Never pause or confirm after calling.",
    expects_response: false,
    response_timeout_secs: 1,
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "Field name: name, email, phone, origin, destination, moveDate, homeSize, specialItems",
        },
        value: {
          type: "string",
          description: "Value to set on the form field",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "submitEstimate",
    description:
      "Submit the completed moving estimate form. Use this after the user has provided enough details and confirmed they want to submit. Returns a confirmation message.",
    expects_response: true,
    response_timeout_secs: 5,
    parameters: { type: "object", properties: {}, required: [] },
  },
];

// ── API Helper ───────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`\nAPI Error ${res.status} on ${method} ${path}:`);
    console.error(text);
    process.exit(1);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Setting up ElevenLabs agent for WordPress Embed Continuity...\n");

  // Step 1: Create the three client tools.
  const toolIds = [];
  for (const tool of TOOLS) {
    process.stdout.write(`  Creating tool: ${tool.name}... `);
    const result = await api("POST", "/convai/tools", {
      name: tool.name,
      description: tool.name,
      tool_config: {
        type: "client",
        name: tool.name,
        description: tool.description,
        expects_response: tool.expects_response,
        response_timeout_secs: tool.response_timeout_secs,
        execution_mode: "immediate",
        force_pre_tool_speech: false,
        parameters: tool.parameters,
      },
    });
    toolIds.push(result.id);
    console.log(`✓ ${result.id}`);
  }

  // Step 2: Create the agent, with tools attached AND override flags
  // enabled in platform_settings. The overrides are the critical piece for
  // this template — without them the widget's resume payload (prompt
  // stitched with prior conversation, page-aware first_message) is silently
  // dropped by the server and the agent falls back to its dashboard
  // defaults on every reload, which breaks continuity.
  process.stdout.write("\n  Creating agent... ");
  const agent = await api("POST", "/convai/agents/create", {
    name: "WordPress Embed Assistant",
    conversation_config: {
      agent: {
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: "gpt-5.2",
          temperature: 0.3,
          max_tokens: -1,
          tool_ids: toolIds,
          enable_parallel_tool_calls: true,
        },
        first_message:
          "Hey! I can get you a moving estimate, show you our services, or answer questions. What are you looking for?",
        language: "en",
        dynamic_variables: {
          dynamicVariablePlaceholders: {
            is_resumed: "false",
            current_page: "/",
          },
        },
      },
      tts: {
        model_id: "eleven_flash_v2",
        voice_id: "cjVigY5qzO86Huf0OWal",
        stability: 0.5,
        speed: 1.0,
        similarity_boost: 0.8,
      },
      turn: {
        turn_timeout: 7,
        mode: "turn",
      },
      conversation: {
        text_only: false,
        max_duration_seconds: 600,
        client_events: [
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
        ],
      },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: {
            first_message: true,
            prompt: { prompt: true },
          },
          conversation: { text_only: true },
        },
      },
    },
  });
  const agentId = agent.agent_id;
  console.log(`✓ ${agentId}`);

  // Done
  console.log(`
${"═".repeat(60)}
  ✅ Setup complete!

  Agent ID: ${agentId}

  Add to your widget/.env.local:
    ELEVENLABS_AGENT_ID=${agentId}
    ELEVENLABS_API_KEY=${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}
    MASCOT_BOT_API_KEY=your_mascotbot_key

  Note: prompt + first_message overrides are ENABLED on this agent —
  this is what lets the widget inject prior-conversation context and
  page-aware resume greetings after every page reload.
${"═".repeat(60)}
`);
}

main();
