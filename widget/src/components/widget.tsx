"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useMascot,
  createElementTap,
  type ElementTap,
} from "@mascotbot/react";
import {
  Alignment,
  Fit,
  Mascot,
  MascotRive,
  useMascotInputs,
  useMascotRive,
  useMascotPlayback,
  useLipsyncStream,
} from "@mascotbot/react/rive";
import {
  appendTurn,
  clearResumePending,
  clearState,
  isResumable,
  markActive,
  markInactive,
  markResumePending,
  readState,
  resetForFreshStart,
  setConversationId,
  setCurrentPage,
  setFacts,
} from "@/lib/continuity-store";
import { buildResumeOverrides } from "@/lib/continuity-overrides";
import { onParentMessage, postToParent } from "@/lib/parent-bridge";

// ============================================================================
// WIDGET CUSTOMIZATION CONFIG
// ============================================================================
// Customize the embedded NotionGuy avatar's appearance here. Applied once the
// Rive file is loaded. Only inputs the .riv actually exposes are set
// (has() is the authoritative gate).
// ============================================================================
const WIDGET_CUSTOMIZATION = {
  gender: 1,
  outline: 10,
  colourful: true,
  flip: false,
  crop: false,
  bg_color: 0,
  shirt_color: 2,
  eyes_type: 2,
  hair_style: 3,
  accessories_hue: 0,
  accessories_saturation: 0,
  accessories_brightness: 100,
} as const;

/**
 * Natural-lip-sync preset — a STABLE module constant. A fresh object every
 * render reinitializes the post-processor and breaks lip sync after the
 * first audio chunk (the single most common integration bug).
 */
const NATURAL_LIP_SYNC_CONFIG = {
  minVisemeInterval: 40,
  mergeWindow: 60,
  keyVisemePreference: 0.6,
  preserveSilence: true,
  similarityThreshold: 0.4,
  preserveCriticalVisemes: true,
  criticalVisemeMinDuration: 80,
} as const;

// Widget Rive contract — verified against the bundled mascot_widget.riv
// (artboard "Widget", state machine "mascotStateMachine"). This is the
// embeddable "notion-guy-widget" avatar fetched by scripts/fetch-avatars.mjs.
const WIDGET_ARTBOARD = "Widget";
const WIDGET_STATE_MACHINE = "mascotStateMachine";

// Delay before the call button appears after the reveal fires (ms).
const BUTTON_APPEAR_AFTER_REVEAL = 4100;
// Bounce animation duration (ms)
const BUTTON_BOUNCE_DURATION = 450;
const SEEN_FLAG_KEY = "mascotbot-widget-revealed";

/**
 * First visit = this tab hasn't seen the widget reveal yet AND we're not
 * resuming a prior call. Resumes always skip the reveal (the user already
 * saw the mascot on the previous page). Any subsequent visit within the same
 * tab also skips — the flag in sessionStorage persists across same-tab
 * navigations/reloads.
 *
 * NOTE: kept for parity with the original behaviour and for the eventual
 * reveal-animation fix (see the reveal effect below). Currently every visit
 * snaps straight to the revealed state.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isFirstVisitInTab(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (isResumable()) return false;
    return sessionStorage.getItem(SEEN_FLAG_KEY) === null;
  } catch {
    return false;
  }
}

function markRevealed(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SEEN_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Minimal shape of the dynamically-imported @elevenlabs/client session. */
interface ElevenLabsSession {
  endSession: () => Promise<void>;
  setMicMuted: (muted: boolean) => void;
  sendContextualUpdate: (text: string) => void;
  getId: () => string;
}

type CallState = "idle" | "connecting" | "resuming" | "connected";

interface WidgetActions {
  start: () => void;
  end: () => void;
}

const phoneIconJsx = (
  <svg
    width="11.063"
    height="11.001"
    viewBox="0 0 11.0634 11.0013"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0 }}
  >
    <path
      d="M2.9101 8.09741C1.29683 6.49654 0 4.39928 0 2.63088C0 1.85527 0.254401 1.1417 0.831458 0.564647C1.19755 0.198557 1.60087 0 1.97316 0C2.28961 0 2.58745 0.142713 2.81703 0.471573L4.05181 2.23377C4.19452 2.43233 4.28139 2.63709 4.28139 2.85426C4.28139 3.10866 4.1635 3.38788 3.88428 3.70433L3.44373 4.20693C3.37547 4.26898 3.35065 4.33723 3.35065 4.41169C3.35065 4.46133 3.36927 4.52959 3.40029 4.59784C3.54921 4.95152 4.0394 5.62786 4.70332 6.29178C5.37966 6.96812 6.0684 7.43969 6.40347 7.60722C6.47172 7.63825 6.54618 7.66307 6.61444 7.66307C6.70131 7.66307 6.78197 7.63204 6.84402 7.56999L7.30939 7.12324C7.61343 6.83781 7.89265 6.71992 8.14705 6.71992C8.36422 6.71992 8.56898 6.80679 8.76134 6.9433L10.6414 8.25253C10.9517 8.4697 11.0634 8.73031 11.0634 8.99092C11.0634 9.41285 10.7593 9.8472 10.4739 10.1264C9.89063 10.7159 9.20189 11.0013 8.37043 11.0013C6.59582 11.0013 4.50477 9.69207 2.9101 8.09741Z"
      fill="white"
    />
  </svg>
);

const loaderIconJsx = (
  <svg
    width="17.461"
    height="17.461"
    viewBox="0 0 17.4609 17.4609"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0, animation: "spin 2.5s linear infinite" }}
  >
    <path
      d="M7.93066 15.2861V13.1035C7.93066 12.6617 8.28864 12.3037 8.73047 12.3037C9.1723 12.3037 9.53027 12.6617 9.53027 13.1035V15.2861C9.53027 15.728 9.1723 16.0859 8.73047 16.0859C8.28864 16.0859 7.93066 15.728 7.93066 15.2861ZM5.07227 11.2646C5.38469 10.9522 5.89168 10.9522 6.2041 11.2646C6.51652 11.5771 6.51652 12.0841 6.2041 12.3965L4.63965 13.96C4.32723 14.2724 3.82121 14.2724 3.50879 13.96C3.19637 13.6475 3.19637 13.1415 3.50879 12.8291L5.07227 11.2646ZM11.2568 11.2646C11.5693 10.9522 12.0763 10.9522 12.3887 11.2646L13.9521 12.8291C14.2646 13.1415 14.2646 13.6475 13.9521 13.96C13.6397 14.2724 13.1337 14.2724 12.8213 13.96L11.2568 12.3965C10.9444 12.0841 10.9444 11.5771 11.2568 11.2646ZM4.36523 7.93848C4.80706 7.93848 5.16504 8.29645 5.16504 8.73828C5.16504 9.18011 4.80706 9.53809 4.36523 9.53809H2.18262C1.74079 9.53809 1.38281 9.18011 1.38281 8.73828C1.38281 8.29645 1.74079 7.93848 2.18262 7.93848H4.36523ZM15.2783 7.93848C15.7201 7.93848 16.0781 8.29645 16.0781 8.73828C16.0781 9.18011 15.7201 9.53809 15.2783 9.53809H13.0957C12.6539 9.53809 12.2959 9.18011 12.2959 8.73828C12.2959 8.29645 12.6539 7.93848 13.0957 7.93848H15.2783ZM3.50879 3.5166C3.82121 3.20418 4.32723 3.20418 4.63965 3.5166L6.2041 5.08008C6.51652 5.3925 6.51652 5.89949 6.2041 6.21191C5.89168 6.52433 5.38469 6.52433 5.07227 6.21191L3.50879 4.64746C3.19637 4.33504 3.19637 3.82902 3.50879 3.5166ZM12.8213 3.5166C13.1337 3.20418 13.6397 3.20418 13.9521 3.5166C14.2646 3.82902 14.2646 4.33504 13.9521 4.64746L12.3887 6.21191C12.0763 6.52433 11.5693 6.52433 11.2568 6.21191C10.9444 5.89949 10.9444 5.3925 11.2568 5.08008L12.8213 3.5166ZM7.93066 4.37305V2.19043C7.93066 1.7486 8.28864 1.39062 8.73047 1.39062C9.1723 1.39062 9.53027 1.7486 9.53027 2.19043V4.37305C9.53027 4.81487 9.1723 5.17285 8.73047 5.17285C8.28864 5.17285 7.93066 4.81487 7.93066 4.37305Z"
      fill="white"
    />
  </svg>
);

function CallButton({
  callState,
  onStart,
  onEnd,
  revealedAt,
}: {
  callState: CallState;
  onStart: () => void;
  onEnd: () => void;
  revealedAt: number | null;
}) {
  // `revealedAt` is the timestamp the reveal animation started. We compute
  // the remaining time dynamically (not a fixed mount-time delay), so the
  // button pops in exactly `BUTTON_APPEAR_AFTER_REVEAL` ms later regardless
  // of when this component mounted relative to the reveal. For
  // subsequent/resume visits the parent pre-seeds `revealedAt` to a past
  // timestamp, making `remaining` come out as 0 — same code path.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!revealedAt) return;
    const elapsed = Date.now() - revealedAt;
    const remaining = Math.max(0, BUTTON_APPEAR_AFTER_REVEAL - elapsed);
    const timer = setTimeout(() => setVisible(true), remaining);
    return () => clearTimeout(timer);
  }, [revealedAt]);

  if (!visible) return null;

  const isEndCall = callState === "connected";
  const isConnecting = callState === "connecting";
  const isResuming = callState === "resuming";
  const isBusy = isConnecting || isResuming;

  // Red when in an active-call-like state (connected OR resuming). Black when
  // idle or first-time connecting. Resume-red makes it visually obvious to
  // the user that the conversation is being preserved, not started fresh.
  const backgroundColor = isEndCall || isResuming ? "#d03318" : "#1f1d22";

  const label = isEndCall
    ? "End Call"
    : isResuming
      ? "Reconnecting"
      : isConnecting
        ? "Connecting"
        : "Voice Chat";

  return (
    <button
      onClick={isEndCall ? onEnd : onStart}
      disabled={isBusy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "clip",
        borderRadius: "43.902px",
        fontSize: "14px",
        fontWeight: 500,
        textTransform: "uppercase",
        color: "white",
        border: "none",
        cursor: isBusy ? "default" : "pointer",
        transition: "opacity 150ms, background-color 200ms",
        opacity: isBusy ? 0.85 : 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        backgroundColor,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.14px",
        lineHeight: "19.105px",
        gap: isEndCall || isResuming ? "5.268px" : "2px",
        padding: "8px 11px",
        pointerEvents: "auto",
        animation: `bounceIn ${BUTTON_BOUNCE_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
      }}
      onMouseEnter={(e) => {
        if (!isBusy) (e.currentTarget as HTMLButtonElement).style.opacity = "0.8";
      }}
      onMouseLeave={(e) => {
        if (!isBusy) (e.currentTarget as HTMLButtonElement).style.opacity = "1";
      }}
    >
      {isBusy ? loaderIconJsx : phoneIconJsx}
      <span>{label}</span>
    </button>
  );
}

function WidgetContent({
  callState,
  onCallStateChange,
  actionsRef,
}: {
  callState: CallState;
  onCallStateChange: (state: CallState) => void;
  actionsRef: React.MutableRefObject<WidgetActions>;
}) {
  // ── Co-located lip-sync pipeline (elevenlabs-avatar shape) ──
  // ElevenLabs self-plays its agent voice through a hidden <audio
  // srcObject=MediaStream>. We tap that element; the SDK computes visemes
  // locally from the tapped stream. Never route ElevenLabs through
  // createPCMStreamPlayer — that would play the voice twice.
  const { client, status } = useMascot();
  const playback = useMascotPlayback({
    stream: true,
    enableNaturalLipSync: true,
    naturalLipSyncConfig: NATURAL_LIP_SYNC_CONFIG,
  });
  const [stream, setStream] = useState<MediaStream | null>(null);
  useLipsyncStream({
    client,
    playback,
    source: { kind: "mediaStream", stream },
  });

  const { rive, isRiveLoaded } = useMascotRive();
  const { custom, has } = useMascotInputs();
  // useMascotInputs() is fresh-per-render — capture in a ref so the
  // long-lived ElevenLabs onModeChange callback reads the current handle.
  const customRef = useRef(custom);
  customRef.current = custom;

  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const urlRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const userEndedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  // Tracks whether the current session was started via the resume path.
  const wasResumeRef = useRef(false);
  // Mirrors the high-level callState so async callbacks can branch without
  // a stale closure (the @elevenlabs/client Conversation does not expose a
  // public `status`, so we track it ourselves).
  const callStateRef = useRef<CallState>(callState);
  callStateRef.current = callState;

  const convoRef = useRef<ElevenLabsSession | null>(null);
  const elTapRef = useRef<ElementTap | null>(null);
  const teardownRef = useRef<null | (() => void)>(null);

  // Consumer-owned Rive input writer. The SDK owns mouth visemes +
  // is_speaking + stress; has() is the authoritative gate for everything we
  // touch here.
  const setInput = useCallback(
    (name: string, v: number | boolean) => {
      if (has(name)) {
        (custom as Record<string, { value: unknown }>)[name].value =
          v as never;
      }
    },
    [custom, has],
  );

  // ── Signed-URL prefetch (instant connect on click) ──
  const getSignedUrl = useCallback(
    async (
      dynamicVariables?: Record<string, string | number | boolean>,
    ): Promise<string> => {
      const response = await fetch("/api/get-signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ dynamicVariables: dynamicVariables ?? {} }),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Failed to get signed url: ${response.statusText}`);
      const data = (await response.json()) as { signedUrl?: string };
      if (!data.signedUrl) throw new Error("signed URL missing");
      return data.signedUrl;
    },
    [],
  );

  const fetchAndCacheUrl = useCallback(async () => {
    try {
      const url = await getSignedUrl();
      setCachedUrl(url);
    } catch (error) {
      console.error("[Widget] Failed to fetch signed URL:", error);
      setCachedUrl(null);
    }
  }, [getSignedUrl]);

  useEffect(() => {
    fetchAndCacheUrl();
    urlRefreshInterval.current = setInterval(fetchAndCacheUrl, 9 * 60 * 1000);
    return () => {
      if (urlRefreshInterval.current) clearInterval(urlRefreshInterval.current);
    };
  }, [fetchAndCacheUrl]);

  // ── Full teardown — runs on every end path ──
  const teardown = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
    elTapRef.current?.close();
    elTapRef.current = null;
    void convoRef.current?.endSession().catch(() => {});
    convoRef.current = null;
    setStream(null); // detaches the worklet from the shared client
  }, []);

  // Stabilise the unmount cleanup (see react-website-demo bug: teardown
  // identity can flip per render and re-fire endSession mid-call).
  const teardownActionRef = useRef(teardown);
  teardownActionRef.current = teardown;
  useEffect(() => () => teardownActionRef.current?.(), []);

  // The ElevenLabs client tools — silent navigation, form edits, submit.
  // Identical semantics to the legacy @elevenlabs/react clientTools map.
  const buildClientTools = useCallback(
    () => ({
      navigateTo: (params: { page: string }) => {
        const page = typeof params?.page === "string" ? params.page : null;
        if (!page) return;
        // Silent, immediate navigation. The agent's system prompt explicitly
        // forbids speaking before/during/after navigateTo — speech is
        // reserved for AFTER the new page loads, driven by the firstMessage
        // override which is page-aware
        // (see continuity-overrides.firstMessageForPage).
        //
        // We ALSO append a synthetic breadcrumb to the transcript buffer:
        // because the agent said nothing during navigateTo, the raw
        // transcript would contain only the user's request — and on the next
        // resume the agent would see "user asked for /estimate" with no
        // record of the nav ever happening, re-triggering navigateTo (an
        // infinite reload loop the first version shipped with). The
        // breadcrumb tells the resumed agent "you've already handled that".
        appendTurn("ai", `[navigated silently to ${page}]`);
        markResumePending();
        postToParent({ type: "widget-navigate", page });
      },
      updateEstimateField: (params: { field: string; value: string }) => {
        const field = typeof params?.field === "string" ? params.field : null;
        const value = typeof params?.value === "string" ? params.value : null;
        if (!field || value === null) return;
        setFacts({ [field]: value });
        postToParent({ type: "widget-form-update", field, value });
      },
      submitEstimate: async () => {
        postToParent({ type: "widget-form-submit" });
        return "Estimate submitted. The user can see a confirmation on their screen.";
      },
    }),
    [],
  );

  const startConversation = useCallback(
    async (opts?: { resume?: boolean }) => {
      if (status !== "ready") return;
      if (callStateRef.current === "connected") return;
      try {
        // "resuming" = red RECONNECTING button, pre-toggled Rive inCall so
        // the mascot starts in the in-call pose (not the idle/collapsed
        // one). "connecting" = black CONNECTING button for fresh starts.
        onCallStateChange(opts?.resume ? "resuming" : "connecting");

        // 1. SYNCHRONOUSLY before any await: create the tap (AudioContext
        //    born running) and patch window.Audio so we can capture the
        //    hidden <audio> @elevenlabs/client creates.
        const tap = createElementTap();
        elTapRef.current = tap;
        setStream(tap.stream);

        const w = window as unknown as {
          Audio: typeof Audio;
          __el?: HTMLAudioElement;
        };
        const OrigAudio = w.Audio;
        w.Audio = function (...args: unknown[]) {
          const el = new OrigAudio(...(args as []));
          w.__el = el;
          return el;
        } as unknown as typeof Audio;

        const [, baseUrl] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          cachedUrl ? Promise.resolve(cachedUrl) : getSignedUrl(),
        ]);
        if (!baseUrl) throw new Error("Missing signed URL");

        const { Conversation } = await import("@elevenlabs/client");
        const clientTools = buildClientTools();

        // Shared callbacks for both fresh and resume sessions. onMessage
        // feeds the continuity transcript buffer — THIS is the wiring that
        // makes resume work (the buffer is later stitched into the resume
        // system prompt by buildResumeOverrides).

        // Per-turn gesture: fire `gesture` trigger on each agent-turn start
        // (mascotbot-docs onModeChange recipe).
        const onModeChange = ({ mode }: { mode: string }) => {
          if (mode !== "speaking") return;
          (customRef.current as Record<string, { fire?: () => void }>)
            .gesture?.fire?.();
        };
        const onConnect = ({ conversationId }: { conversationId: string }) => {
          onCallStateChange("connected");
          setConversationId(conversationId ?? null);
          markActive(conversationId ?? null, window.location.pathname);
          // Resume kick-off: the agent navigated silently, so on the new
          // page it speaks FIRST via the firstMessage override (a page-aware
          // literal line). Nothing else needed here.
          wasResumeRef.current = false;
        };
        const onDisconnect = () => {
          onCallStateChange("idle");
          // If the user explicitly pressed "End call", clear the continuity
          // buffer so the next page load starts fresh. If the disconnect was
          // because the page is about to reload (agent navigation), leave
          // the buffer intact — it is rehydrated on the next page load.
          if (userEndedRef.current) {
            clearState();
            userEndedRef.current = false;
          }
          teardown();
        };
        const onError = (message: string) => {
          console.error("[Widget] ElevenLabs error:", message);
          onCallStateChange("idle");
          teardown();
        };
        const onMessage = ({
          message,
          source,
        }: {
          message: string;
          source: "user" | "ai";
        }) => {
          if (!message) return;
          appendTurn(source === "user" ? "user" : "ai", message);
        };

        let convo: ElevenLabsSession;
        if (opts?.resume) {
          const state = readState();
          if (state && state.transcript.length > 0) {
            const { overrides, dynamicVariables } =
              buildResumeOverrides(state);
            const freshUrl = await getSignedUrl(dynamicVariables);
            // Set the resume flag BEFORE startSession so onConnect can read
            // it and fire the continuity kick-off contextual update.
            wasResumeRef.current = true;
            convo = (await Conversation.startSession({
              signedUrl: freshUrl,
              overrides,
              dynamicVariables,
              clientTools,
              onModeChange,
              onConnect,
              onDisconnect,
              onError,
              onMessage,
            })) as unknown as ElevenLabsSession;
            convoRef.current = convo;
            // Clear the resume flag — this reload has been consumed. A later
            // manual reload won't re-trigger resume until the agent
            // navigates again.
            clearResumePending();
          } else {
            // Resume was requested but there is nothing to resume — fall
            // back to a clean fresh session.
            wasResumeRef.current = false;
            resetForFreshStart(window.location.pathname);
            convo = (await Conversation.startSession({
              signedUrl: baseUrl,
              clientTools,
              onModeChange,
              onConnect,
              onDisconnect,
              onError,
              onMessage,
            })) as unknown as ElevenLabsSession;
            convoRef.current = convo;
          }
        } else {
          // Fresh start (user clicked the button, not an agent-driven
          // resume). Blow away any stale continuity data so a previous call
          // doesn't leak into this one.
          wasResumeRef.current = false;
          resetForFreshStart(window.location.pathname);
          convo = (await Conversation.startSession({
            signedUrl: baseUrl,
            clientTools,
            onConnect,
            onDisconnect,
            onError,
            onMessage,
          })) as unknown as ElevenLabsSession;
          convoRef.current = convo;
        }

        // 2. Poll for the hidden <audio> element and tap it cross-browser
        //    (Safari has no captureStream). tap.stream is stable + silent
        //    until this attach lands.
        const hasAudioStream = (
          el: HTMLAudioElement | undefined,
        ): el is HTMLAudioElement =>
          !!el &&
          el.srcObject instanceof MediaStream &&
          el.srcObject.getAudioTracks().length > 0;
        let tries = 0;
        const iv = window.setInterval(() => {
          const el = w.__el;
          if (hasAudioStream(el)) {
            tap.attach(el);
            tap.resume();
            window.clearInterval(iv);
          } else if (++tries > 100) {
            window.clearInterval(iv);
          }
        }, 100);

        teardownRef.current = () => {
          window.clearInterval(iv);
          w.Audio = OrigAudio;
          // Null the stash so the next call doesn't latch onto this dead el.
          w.__el = undefined;
        };
      } catch (error) {
        console.error("[Widget] Failed to start:", error);
        teardown();
        onCallStateChange("idle");
      }
    },
    [
      status,
      cachedUrl,
      getSignedUrl,
      buildClientTools,
      onCallStateChange,
      teardown,
    ],
  );

  const stopConversation = useCallback(async () => {
    userEndedRef.current = true;
    markInactive();
    await convoRef.current?.endSession().catch(() => {});
    teardown();
    onCallStateChange("idle");
  }, [teardown, onCallStateChange]);

  // Auto-resume on mount if sessionStorage says a call was active.
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (!isResumable()) return;
    if (status !== "ready") return;
    resumeAttemptedRef.current = true;
    void startConversation({ resume: true });
  }, [status, startConversation]);

  // Keep the Rive `inCall` input in sync with the high-level callState.
  // Anything that isn't "idle" should render as in-call — that covers
  // connecting, resuming, and connected without races. Using callState (not
  // a connection status) matters on resume page loads: callState is
  // initialized synchronously to "resuming" via useState lazy init, so this
  // effect fires with the correct value on the very first render.
  useEffect(() => {
    if (!isRiveLoaded) return;
    setInput("inCall", callState !== "idle");
  }, [isRiveLoaded, callState, setInput]);

  // Listen for parent-side messages (current page, form edits from user).
  useEffect(() => {
    const unsubscribe = onParentMessage((msg) => {
      if (msg.type === "widget-current-page") {
        setCurrentPage(msg.pathname);
      } else if (msg.type === "widget-form-user-edit") {
        setFacts({ [msg.field]: msg.value });
        if (callStateRef.current === "connected") {
          convoRef.current?.sendContextualUpdate(
            `User edited ${msg.field} to "${msg.value}".`,
          );
        }
      }
    });
    return unsubscribe;
  }, []);

  // Apply widget customization once Rive is loaded.
  useEffect(() => {
    if (!isRiveLoaded) return;
    for (const [key, value] of Object.entries(WIDGET_CUSTOMIZATION)) {
      setInput(key, value as number | boolean);
    }
    // Legacy alias: "character" mirrors "gender".
    setInput("character", WIDGET_CUSTOMIZATION.gender);
  }, [isRiveLoaded, setInput]);

  // Reveal handling. The reveal trigger is fired directly on the raw Rive
  // state machine inputs (going through the inputs API silently no-ops with
  // the current SDK/Rive combo). For now ALL visits (including first) skip
  // the reveal animation and snap straight to the fully revealed state.
  //
  // TODO(reveal-animation): re-enable the first-visit reveal play once the
  // .riv's reveal transition responds to the trigger from JS. The structure
  // (isFirstVisitInTab / markRevealed / SEEN_FLAG_KEY) is left intact for
  // the eventual fix.
  const revealAppliedRef = useRef(false);
  useEffect(() => {
    if (!isRiveLoaded || !rive || revealAppliedRef.current) return;
    revealAppliedRef.current = true;
    markRevealed();

    const inputs =
      (
        rive as unknown as {
          stateMachineInputs?: (
            sm: string,
          ) => Array<{ name: string; value: unknown }> | undefined;
        }
      ).stateMachineInputs?.(WIDGET_STATE_MACHINE) ?? undefined;
    const setRaw = (name: string, value: boolean) => {
      const input = inputs?.find((i) => i.name === name);
      if (input) {
        try {
          input.value = value;
        } catch {
          /* ignore */
        }
      }
    };

    // Snap straight to revealed. On resume also pre-toggle inCall so the
    // mascot is in its in-call pose on the very first rendered frame (no
    // idle-pose flash between Rive load and React's useEffect running).
    setInput("isRevealed", true);
    setRaw("isRevealed", true);
    if (isResumable()) {
      setInput("inCall", true);
      setRaw("inCall", true);
    }
  }, [isRiveLoaded, rive, setInput]);

  // Signal widget-ready once Rive has loaded.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!isRiveLoaded || readyFiredRef.current) return;
    readyFiredRef.current = true;
    postToParent({ type: "widget-ready" });
  }, [isRiveLoaded]);

  useEffect(() => {
    actionsRef.current = {
      start: () => void startConversation(),
      end: () => void stopConversation(),
    };
  }, [startConversation, stopConversation, actionsRef]);

  return null;
}

export function PersistentWidget() {
  // Initialize synchronously from sessionStorage. If this page load is a
  // resume (i.e. the prior page called navigateTo), we want the widget to
  // render in "resuming" state from the FIRST frame — red RECONNECTING
  // button, mascot in in-call pose — not flash through the idle pose while
  // startConversation's awaits (getUserMedia, signed URL) resolve.
  const [callState, setCallState] = useState<CallState>(() => {
    if (typeof window === "undefined") return "idle";
    return isResumable() ? "resuming" : "idle";
  });
  // `revealedAt` drives when the call button appears. With the reveal
  // animation temporarily disabled, we seed this to a past timestamp
  // unconditionally so the button shows immediately on every visit.
  const [revealedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    return Date.now() - BUTTON_APPEAR_AFTER_REVEAL - 10;
  });
  const actionsRef = useRef<WidgetActions>({ start: () => {}, end: () => {} });

  const handleStart = useCallback(() => {
    actionsRef.current.start();
  }, []);

  const handleEnd = useCallback(() => {
    actionsRef.current.end();
  }, []);

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.12); }
          75% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="fixed bottom-0 right-0"
        style={{
          width: 300,
          height: 380,
          pointerEvents: "none",
          zIndex: 2147483646,
        }}
      >
        <div className="w-full h-full">
          <Mascot
            src="/mascot_widget.riv"
            artboard={WIDGET_ARTBOARD}
            stateMachine={WIDGET_STATE_MACHINE}
            // The SDK owns mouth visemes + is_speaking + stress — declare
            // ONLY consumer-owned inputs here (rive-coexistence contract).
            inputs={[
              "inCall",
              "isRevealed",
              "reveal",
              "gender",
              "character", // legacy alias for gender
              "outline",
              "colourful",
              "flip",
              "crop",
              "bg_color",
              "shirt_color",
              "eyes_type",
              "hair_style",
              "accessories_hue",
              "accessories_saturation",
              "accessories_brightness",
            ]}
            layout={{ fit: Fit.Contain, alignment: Alignment.BottomRight }}
          >
            <WidgetContent
              callState={callState}
              onCallStateChange={setCallState}
              actionsRef={actionsRef}
            />
            <MascotRive />
          </Mascot>
        </div>

        <div
          data-overlay
          className="absolute flex justify-center items-end"
          style={{
            bottom: 20,
            left: 0,
            right: -135,
            pointerEvents: "none",
          }}
        >
          <CallButton
            callState={callState}
            onStart={handleStart}
            onEnd={handleEnd}
            revealedAt={revealedAt}
          />
        </div>
      </div>
    </>
  );
}
