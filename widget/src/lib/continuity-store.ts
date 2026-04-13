const KEY = "mascotbot-continuity";
const MAX_TURNS = 20;
const STALE_MS = 10 * 60 * 1000;
const VERSION = 1;

export type TranscriptEntry = {
  role: "user" | "ai";
  text: string;
  ts: number;
};

export type ContinuityState = {
  version: 1;
  wasActive: boolean;
  /**
   * True ONLY when the agent itself triggered a navigation (via the navigateTo
   * client tool). This is the signal to auto-resume on the next page load.
   *
   * A plain user-initiated reload (Cmd+R, back button, deep-link) does NOT set
   * this — so manual reloads land on a clean "VOICE CHAT" button, not a forced
   * reconnect the user never asked for.
   */
  resumePending: boolean;
  conversationId: string | null;
  startedAt: number;
  lastTurnAt: number;
  transcript: TranscriptEntry[];
  facts: Record<string, string | number | boolean>;
  currentPage: string;
};

function safeParse(raw: string | null): ContinuityState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ContinuityState;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(state: ContinuityState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sessionStorage write can throw (quota, disabled storage, private mode).
    // We don't rethrow — continuity is best-effort and must never break the call.
  }
}

function emptyState(currentPage: string): ContinuityState {
  return {
    version: VERSION,
    wasActive: false,
    resumePending: false,
    conversationId: null,
    startedAt: 0,
    lastTurnAt: 0,
    transcript: [],
    facts: {},
    currentPage,
  };
}

export function readState(): ContinuityState | null {
  if (typeof window === "undefined") return null;
  return safeParse(sessionStorage.getItem(KEY));
}

/**
 * Should the widget auto-resume on this page load?
 *
 * ONLY true when the previous page hop was an agent-triggered navigation
 * (resumePending flag was set in that widget-navigate handler). A manual user
 * reload never satisfies this — which is what the user expects: hitting
 * reload shouldn't forcibly reconnect them to the agent.
 */
export function isResumable(now = Date.now()): boolean {
  const state = readState();
  if (!state) return false;
  if (!state.resumePending) return false;
  if (state.transcript.length === 0) return false;
  if (now - state.lastTurnAt > STALE_MS) return false;
  return true;
}

export function markActive(
  conversationId: string | null,
  currentPage: string,
): void {
  const existing = readState();
  const next: ContinuityState = existing
    ? {
        ...existing,
        wasActive: true,
        conversationId,
        currentPage,
        lastTurnAt: Math.max(existing.lastTurnAt, Date.now()),
        startedAt: existing.startedAt || Date.now(),
      }
    : {
        ...emptyState(currentPage),
        wasActive: true,
        conversationId,
        startedAt: Date.now(),
        lastTurnAt: Date.now(),
      };
  write(next);
}

/**
 * Fresh conversation — nuke any prior transcript (from a stale session still
 * sitting in sessionStorage) and start clean. Called when the user clicks the
 * "Voice Chat" button on a fresh page, so we don't inadvertently inject the
 * previous call's history into a new call.
 */
export function resetForFreshStart(currentPage: string): void {
  write({
    ...emptyState(currentPage),
    wasActive: true,
    startedAt: Date.now(),
    lastTurnAt: Date.now(),
  });
}

export function markInactive(): void {
  const existing = readState();
  if (!existing) return;
  write({
    ...existing,
    wasActive: false,
    resumePending: false,
    transcript: [],
    conversationId: null,
    startedAt: 0,
    lastTurnAt: 0,
  });
}

/**
 * Called right before the agent-triggered hard reload fires.
 * Sets the flag that tells the next page load "yes, auto-resume".
 */
export function markResumePending(): void {
  const existing = readState();
  if (!existing) return;
  write({ ...existing, resumePending: true, lastTurnAt: Date.now() });
}

/**
 * Called on the new page once we've kicked off the resume session.
 * Clears the flag so a subsequent manual reload doesn't re-trigger resume.
 */
export function clearResumePending(): void {
  const existing = readState();
  if (!existing) return;
  if (!existing.resumePending) return;
  write({ ...existing, resumePending: false });
}

export function clearState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function collapseOlder(transcript: TranscriptEntry[]): TranscriptEntry[] {
  if (transcript.length <= MAX_TURNS) return transcript;
  const keep = transcript.slice(-MAX_TURNS);
  const dropped = transcript.slice(0, transcript.length - MAX_TURNS);
  const summaryText =
    "[earlier conversation, " +
    dropped.length +
    " turns: " +
    dropped
      .map((t) => {
        const firstSentence = t.text.split(/[.!?]/)[0].trim();
        return `${t.role}: ${firstSentence}`;
      })
      .filter((s) => s.length > 4)
      .join(" | ") +
    "]";
  const summary: TranscriptEntry = {
    role: "ai",
    text: summaryText,
    ts: dropped[0]?.ts ?? Date.now(),
  };
  return [summary, ...keep];
}

export function appendTurn(role: "user" | "ai", text: string): void {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const existing = readState() ?? emptyState(window.location.pathname);
  const transcript = collapseOlder([
    ...existing.transcript,
    { role, text: trimmed, ts: Date.now() },
  ]);
  write({
    ...existing,
    transcript,
    lastTurnAt: Date.now(),
    wasActive: true,
  });
}

export function setFacts(patch: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const existing = readState() ?? emptyState(window.location.pathname);
  write({
    ...existing,
    facts: { ...existing.facts, ...patch },
    lastTurnAt: Date.now(),
  });
}

export function setCurrentPage(pathname: string): void {
  if (typeof window === "undefined") return;
  const existing = readState();
  if (!existing) return;
  if (existing.currentPage === pathname) return;
  write({ ...existing, currentPage: pathname });
}

export function setConversationId(id: string | null): void {
  if (typeof window === "undefined") return;
  const existing = readState();
  if (!existing) return;
  write({ ...existing, conversationId: id });
}
