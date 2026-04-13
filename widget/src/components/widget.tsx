"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import {
  Alignment,
  Fit,
  MascotClient,
  MascotProvider,
  MascotRive,
  useMascot,
  useMascotElevenlabs,
} from "@mascotbot-sdk/react";
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
};

const LIP_SYNC_CONFIG = {
  minVisemeInterval: 40,
  mergeWindow: 60,
  keyVisemePreference: 0.6,
  preserveSilence: true,
  similarityThreshold: 0.4,
  preserveCriticalVisemes: true,
  criticalVisemeMinDuration: 80,
};

// Delay before button appears after reveal fires (ms). Matches the
// react-website-demo reference — long enough for the full Rive reveal
// animation to play before the button pops in.
const BUTTON_APPEAR_AFTER_REVEAL = 4100;
// Bounce animation duration (ms)
const BUTTON_BOUNCE_DURATION = 450;
// How long after Rive is ready we wait before firing the reveal trigger.
// Matches the reference — lets the state machine fully initialize so the
// trigger plays the animation reliably.
const REVEAL_START_DELAY_MS = 1000;
const SEEN_FLAG_KEY = "mascotbot-widget-revealed";

/**
 * First visit = this tab hasn't seen the widget reveal yet AND we're not
 * resuming a prior call. Resumes always skip the reveal (the user already
 * saw the mascot on the previous page). Any subsequent visit within the
 * same tab also skips — the flag in sessionStorage persists across same-tab
 * navigations/reloads.
 */
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
  // Single source of truth for when the button is allowed to appear:
  // `revealedAt` is the timestamp the reveal animation started. We compute
  // the remaining time dynamically (not a fixed mount-time delay), so the
  // button pops in exactly `BUTTON_APPEAR_AFTER_REVEAL` ms later regardless
  // of when this component mounted relative to the reveal.
  //
  // For subsequent/resume visits the parent pre-seeds `revealedAt` to a
  // past timestamp, making `remaining` come out as 0 — same code path,
  // button shows immediately.
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
  // idle or first-time connecting. Resume-red makes it visually obvious to the
  // user that the conversation is being preserved, not started fresh.
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
  onReveal,
}: {
  callState: CallState;
  onCallStateChange: (state: CallState) => void;
  actionsRef: React.MutableRefObject<WidgetActions>;
  onReveal: () => void;
}) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const urlRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const userEndedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  // Tracks whether the current session was started via the resume path. The
  // auto-kick-off contextual update only fires when this is true — we don't
  // want the agent to get an extra nudge on a fresh call.
  const wasResumeRef = useRef(false);

  const { rive, customInputs } = useMascot();

  const conversation = useConversation({
    clientTools: {
      navigateTo: (params: { page: string }) => {
        const page = typeof params?.page === "string" ? params.page : null;
        if (!page) return;
        // Silent, immediate navigation. The agent's system prompt explicitly
        // forbids speaking before/during/after navigateTo — speech is reserved
        // for AFTER the new page loads, driven by the first_message override
        // which is page-aware (see continuity-overrides.firstMessageForPage).
        //
        // We ALSO append a synthetic breadcrumb to the transcript buffer:
        // because the agent said nothing during navigateTo, the raw transcript
        // would contain only the user's request — and on the next resume the
        // agent would see "user asked for /estimate" with no record of the
        // nav ever happening, re-triggering navigateTo (an infinite reload
        // loop the first version shipped with). The breadcrumb tells the
        // resumed agent "you've already handled that".
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
    },
    onConnect: ({ conversationId }) => {
      onCallStateChange("connected");
      setConversationId(conversationId ?? null);
      markActive(conversationId ?? null, window.location.pathname);

      // Resume kick-off: the agent navigated silently, so on the new page it
      // speaks FIRST via the firstMessage override (a page-aware literal line,
      // see continuity-overrides.firstMessageForPage). Nothing else needed
      // here — the sendContextualUpdate + sendUserMessage trick was tried
      // and caused an infinite reload loop (the LLM interpreted the hidden
      // path marker inside the user message as a new navigateTo request).
      wasResumeRef.current = false;
    },
    onDisconnect: () => {
      onCallStateChange("idle");
      // If the user explicitly pressed "End call", clear the continuity buffer
      // so the next page load starts fresh. If the disconnect was because the
      // page is about to reload (agent navigation), leave the buffer intact —
      // it will be rehydrated on the next page load.
      if (userEndedRef.current) {
        clearState();
        userEndedRef.current = false;
      }
    },
    onError: (error: unknown) => {
      console.error("[Widget] ElevenLabs error:", error);
      onCallStateChange("idle");
    },
    onMessage: ({ message, source }) => {
      if (!message) return;
      appendTurn(source === "user" ? "user" : "ai", message);
    },
    onDebug: () => {},
  });

  useMascotElevenlabs({
    conversation,
    debug: false,
    gesture: true,
    naturalLipSync: true,
    naturalLipSyncConfig: LIP_SYNC_CONFIG,
  });

  const getSignedUrl = useCallback(
    async (dynamicVariables?: Record<string, string | number | boolean>) => {
      const response = await fetch("/api/get-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ dynamicVariables: dynamicVariables ?? {} }),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Failed to get signed url: ${response.statusText}`);
      const data = (await response.json()) as { signedUrl: string };
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

  const startConversation = useCallback(
    async (opts?: { resume?: boolean }) => {
      try {
        // "resuming" = red RECONNECTING button, pre-toggled Rive inCall so
        // the mascot starts in the in-call pose (not the idle/collapsed one).
        // "connecting" = black CONNECTING button for fresh starts.
        onCallStateChange(opts?.resume ? "resuming" : "connecting");
        const [, signedUrl] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          cachedUrl ? Promise.resolve(cachedUrl) : getSignedUrl(),
        ]);
        if (!signedUrl) throw new Error("Missing signed URL");

        if (opts?.resume) {
          const state = readState();
          if (state && state.transcript.length > 0) {
            const { overrides, dynamicVariables } = buildResumeOverrides(state);
            const freshUrl = await getSignedUrl(dynamicVariables);
            // Set the resume flag BEFORE startSession so onConnect can read it
            // and fire the continuity kick-off contextual update.
            wasResumeRef.current = true;
            await conversation.startSession({
              signedUrl: freshUrl,
              overrides,
              dynamicVariables,
            });
            // Clear the resume flag — this reload has been consumed. A later
            // manual reload won't re-trigger resume until the agent navigates
            // again.
            clearResumePending();
            return;
          }
        }

        // Fresh start (user clicked the button, not an agent-driven resume).
        // Blow away any stale continuity data so a previous call doesn't leak
        // into this one.
        wasResumeRef.current = false;
        resetForFreshStart(window.location.pathname);
        await conversation.startSession({ signedUrl });
      } catch (error) {
        console.error("[Widget] Failed to start:", error);
        onCallStateChange("idle");
      }
    },
    [conversation, cachedUrl, getSignedUrl, onCallStateChange],
  );

  const stopConversation = useCallback(async () => {
    userEndedRef.current = true;
    markInactive();
    await conversation.endSession();
  }, [conversation]);

  // Auto-resume on mount if sessionStorage says a call was active.
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (!isResumable()) return;
    resumeAttemptedRef.current = true;
    startConversation({ resume: true });
  }, [startConversation]);

  // Keep the Rive `inCall` input in sync with the high-level callState (the
  // single source of truth maintained in the parent). Anything that isn't
  // "idle" should render as in-call — that covers connecting, resuming, and
  // connected without races.
  //
  // Using callState (not conversation.status) matters on resume page loads:
  // callState is initialized synchronously to "resuming" via useState lazy
  // init, so this effect fires with the correct value on the very first
  // render. conversation.status, by contrast, stays "disconnected" until
  // startConversation's awaits complete — which caused the idle-pose flash
  // the user reported.
  useEffect(() => {
    if (!customInputs?.inCall) return;
    customInputs.inCall.value = callState !== "idle";
  }, [callState, customInputs]);


  // Listen for parent-side messages (current page, form edits from user).
  useEffect(() => {
    const unsubscribe = onParentMessage((msg) => {
      if (msg.type === "widget-current-page") {
        setCurrentPage(msg.pathname);
      } else if (msg.type === "widget-form-user-edit") {
        setFacts({ [msg.field]: msg.value });
        if (conversation.status === "connected") {
          conversation.sendContextualUpdate(
            `User edited ${msg.field} to "${msg.value}".`,
          );
        }
      }
    });
    return unsubscribe;
  }, [conversation]);

  // Apply widget customization once Rive is loaded.
  useEffect(() => {
    if (!customInputs) return;
    Object.entries(WIDGET_CUSTOMIZATION).forEach(([key, value]) => {
      if (customInputs[key]) customInputs[key].value = value;
    });
    if (customInputs.character)
      customInputs.character.value = WIDGET_CUSTOMIZATION.gender;
  }, [customInputs]);

  // Fire reveal trigger — once only. Matches the react-website-demo
  // reference exactly: wait for both `rive` and `customInputs` to be truthy
  // (meaning the Rive file AND the SDK's state machine input wrappers are
  // ready), settle for REVEAL_START_DELAY_MS, then fire the trigger AND
  // call onReveal() in the same setTimeout callback so the button's clock
  // starts at the exact timestamp the reveal animation begins.
  //
  // This effect only fires reveal on the first visit. Subsequent visits and
  // resumes already have isRevealed=true set synchronously in onRiveLoad
  // (no animation, no flash), and the parent pre-seeds `revealedAt` to a
  // past timestamp so the button shows immediately.
  const revealFired = useRef(false);
  useEffect(() => {
    if (!rive || !customInputs || revealFired.current) return;
    if (!isFirstVisitInTab()) return;
    const timer = setTimeout(() => {
      if (revealFired.current) return;
      revealFired.current = true;
      customInputs?.reveal?.fire?.();
      markRevealed();
      onReveal();
    }, REVEAL_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rive, customInputs, onReveal]);

  // Signal widget-ready once Rive has loaded. The mascot appears instantly
  // because `isRevealed` is set to true on load (see MascotClient onRiveLoad).
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!rive || readyFiredRef.current) return;
    readyFiredRef.current = true;
    postToParent({ type: "widget-ready" });
  }, [rive]);

  useEffect(() => {
    actionsRef.current = {
      start: () => startConversation(),
      end: stopConversation,
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
  // `revealedAt` drives when the call button appears. First visit: null
  // until the reveal-trigger useEffect fires it. Subsequent/resume:
  // pre-seed to a past timestamp so the button's elapsed-time math yields
  // 0 remaining delay and it shows immediately.
  const [revealedAt, setRevealedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    if (isFirstVisitInTab()) return null;
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
    <MascotProvider>
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
          <MascotClient
            src="/mascot_widget.riv"
            artboard="Widget"
            shouldDisableRiveListeners={true}
            inputs={[
              "gesture",
              "is_speaking",
              "inCall",
              "isRevealed",
              "reveal",
              "gender",
              "character",
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
            // @ts-ignore — stateMachine prop added to SDK but not in .d.ts yet
            stateMachine="mascotStateMachine"
            onRiveLoad={(rive: any) => {
              // We ONLY handle the subsequent-visit / resume fast path
              // here — snap isRevealed=true and (on resume) inCall=true on
              // the raw state machine inputs so the mascot appears fully in
              // its final pose on the very first rendered frame, no flash.
              //
              // The first-visit animated reveal is handled by a useEffect
              // in WidgetContent (matching the react-website-demo
              // reference) — it waits for customInputs to be ready, settles
              // for 1000ms, then fires the trigger and calls onReveal in
              // the same tick to start the button's clock.
              if (isFirstVisitInTab()) return;
              const inputs = rive?.stateMachineInputs?.("mascotStateMachine");
              if (!inputs) return;
              const setBool = (name: string, value: boolean) => {
                const input = inputs.find((i: any) => i.name === name);
                if (!input) return;
                try {
                  input.value = value;
                } catch {
                  /* ignore */
                }
              };
              setBool("isRevealed", true);
              if (isResumable()) setBool("inCall", true);
            }}
          >
            <WidgetContent
              callState={callState}
              onCallStateChange={setCallState}
              actionsRef={actionsRef}
              onReveal={() => setRevealedAt(Date.now())}
            />
            <MascotRive showLoadingSpinner={false} />
          </MascotClient>
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
    </MascotProvider>
  );
}
