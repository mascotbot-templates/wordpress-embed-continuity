import { ContinuityState, TranscriptEntry } from "./continuity-store";
import { ORIGINAL_SYSTEM_PROMPT } from "./agent-prompt";

function formatTranscript(transcript: TranscriptEntry[]): string {
  return transcript
    .map((t) => `${t.role === "user" ? "User" : "Agent"}: ${t.text}`)
    .join("\n");
}

/**
 * Page-aware resume greeting. The agent navigated silently (per its prompt
 * rules) and this is the first thing the user hears on the new page. Each
 * line is a natural follow-up to a navigation — a question that immediately
 * keeps the conversation moving forward on the new page, with no greeting
 * and no "okay, continuing" fluff.
 *
 * Why literal strings instead of LLM generation? The ElevenLabs
 * `conversation_config_override.agent.first_message` is a verbatim line — it
 * can't be "let the LLM decide". And alternatives that DO involve the LLM
 * (sendUserMessage with hidden markers, contextual_update to trigger a turn)
 * either don't trigger a response at all, or risk the LLM misinterpreting
 * the hidden payload as a user intent (e.g. treating the path inside the
 * marker as a navigateTo request, which causes an infinite reload loop).
 *
 * Deterministic map is boring but bulletproof.
 */
function firstMessageForPage(
  page: string,
  transcript: TranscriptEntry[],
  facts: Record<string, string | number | boolean>,
): string {
  // Normalize: strip query / hash, trim trailing slash (but keep "/").
  const path = (page || "/").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

  switch (path) {
    case "/estimate": {
      if (!facts.name) return "What's your name?";
      if (!facts.origin) return "And where are you moving from?";
      if (!facts.destination) return "Where are you moving to?";
      if (!facts.moveDate) return "What date are you moving?";
      if (!facts.homeSize) return "What size is your place — 1-bed, 2-bed, bigger?";
      return "Any special items I should know about, like a piano or safe?";
    }
    case "/contact":
      return "Happy to help — what's the best way for us to reach back out to you?";
    case "/services":
      return "Which service are you curious about — local, long-distance, packing, storage?";
    case "/about":
      return "What would you like to know about us?";
    default:
      // Home or anything else — use the last user turn for context, fall back
      // to a neutral prompt.
      {
        const lastUser = [...transcript]
          .reverse()
          .find((t) => t.role === "user");
        if (lastUser && lastUser.text.length < 60) {
          return "How can I help with that?";
        }
        return "What can I help you with?";
      }
  }
}

export type ResumeOverrides = {
  overrides: {
    agent: {
      prompt: { prompt: string };
      firstMessage: string;
    };
  };
  dynamicVariables: Record<string, string | number | boolean>;
};

export function buildResumeOverrides(state: ContinuityState): ResumeOverrides {
  const transcriptBlock = formatTranscript(state.transcript);
  const stitchedPrompt =
    ORIGINAL_SYSTEM_PROMPT +
    "\n\n---\nRESUME MODE — CRITICAL RULES (the user just reloaded the page; the conversation must feel unbroken):\n" +
    "1. DO NOT greet. No 'hi', 'hey', 'hello', 'welcome back'.\n" +
    "2. DO NOT announce the resume. No 'okay, continuing', 'picking up', 'where were we', 'as I was saying'.\n" +
    "3. DO NOT apologize. No 'sorry about that', 'sorry for the interruption'.\n" +
    "4. Your FIRST line (given to you as first_message) is the start of your response. Continue naturally from there.\n" +
    "5. Do NOT call navigateTo right now — the user just arrived on this page. Wait for them to ask.\n" +
    "\n---\nPRIOR CONVERSATION:\n" +
    transcriptBlock;

  return {
    overrides: {
      agent: {
        prompt: { prompt: stitchedPrompt },
        firstMessage: firstMessageForPage(
          state.currentPage,
          state.transcript,
          state.facts,
        ),
      },
    },
    dynamicVariables: {
      ...state.facts,
      current_page: state.currentPage,
      is_resumed: "true",
    },
  };
}
