/**
 * When the agent calls navigateTo, we can't navigate immediately — the agent
 * is usually about to speak a closing line ("Alright, taking you there…") and
 * the audio is still streaming/playing. Navigating at the moment the tool
 * call fires cuts that line off mid-sentence and loses it from the transcript
 * buffer.
 *
 * This helper gates the navigation until the agent has:
 *   1. Actually started speaking (given enough time for the audio stream to
 *      begin), OR
 *   2. Clearly chosen not to speak (a short pause with no audio at all).
 * AND THEN
 *   3. Finished speaking (sustained silence for a grace window).
 *
 * Hard ceiling at MAX_WAIT_MS so a rogue agent that keeps speaking forever
 * doesn't block the navigation indefinitely.
 */

const WAIT_FOR_SPEECH_START_MS = 1500; // Give the agent up to 1.5s to start talking
const POST_SPEECH_SILENCE_MS = 800; // After speech ends, wait 800ms before navigating
const NO_SPEECH_PAUSE_MS = 500; // If agent never speaks, pause 500ms for safety
const MAX_WAIT_MS = 6000; // Hard ceiling — navigate no matter what

type IsSpeakingProbe = () => boolean;

export function waitThenNavigate(
  isSpeaking: IsSpeakingProbe,
  fire: () => void,
): () => void {
  const startedAt = Date.now();
  let hasEverSpoken = false;
  let silenceStartedAt: number | null = isSpeaking() ? null : Date.now();
  let settled = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (intervalId !== null) clearInterval(intervalId);
    fire();
  };

  intervalId = setInterval(() => {
    if (settled) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_WAIT_MS) {
      finish();
      return;
    }

    const speaking = isSpeaking();

    if (speaking) {
      hasEverSpoken = true;
      silenceStartedAt = null;
      return;
    }

    // Not currently speaking.
    if (silenceStartedAt === null) silenceStartedAt = Date.now();
    const silentFor = Date.now() - silenceStartedAt;

    if (!hasEverSpoken) {
      // Agent hasn't spoken yet. Keep waiting for it to start, up to the
      // initial window. If the window passes without speech, do a short
      // safety pause and navigate — the agent must have chosen silence.
      if (elapsed < WAIT_FOR_SPEECH_START_MS) return;
      if (silentFor >= NO_SPEECH_PAUSE_MS) finish();
      return;
    }

    // Agent did speak at some point. Wait for sustained silence.
    if (silentFor >= POST_SPEECH_SILENCE_MS) finish();
  }, 50);

  return () => {
    if (intervalId !== null) clearInterval(intervalId);
    settled = true;
  };
}
