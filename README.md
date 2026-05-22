# WordPress Embed with ElevenLabs Continuity

> Drop-in `<script>` voice widget for any WordPress / legacy multi-page site. The conversation survives full page reloads — agent-driven navigation, user reloads, the back button — it all feels like one uninterrupted call.

**[Live Demo](https://wp-embed-continuity-demo.vercel.app)** | **[Widget Endpoint](https://wp-embed-continuity-widget.vercel.app)** | [Report Issue](https://github.com/mascotbot-templates/wordpress-embed-continuity/issues)

## What This Demonstrates

- **Client-side viseme inference** — `@mascotbot/{core,react}` computes visemes in the browser; the widget taps the ElevenLabs `<audio>` element via `createElementTap()` and feeds it to `useLipsyncStream()`. No MascotBot server is in the audio path
- **Plain ElevenLabs signed URL** — `/api/get-signed-url` mints a single-use Conversational-AI signed URL with the server-side `xi-api-key`; there is no `api.mascot.bot` proxy
- **Drop-in embed** — one `<script>` tag, no plugin, no theme edits, no React on the host page
- **Cross-reload continuity** — the conversation persists through full page reloads via a transcript buffer in the widget iframe's `sessionStorage`, stitched back into the agent via `overrides.agent.prompt.prompt` + a page-aware `firstMessage`
- **Silent agent-driven navigation** — when the agent calls `navigateTo`, it stays quiet. The browser hard-reloads, and the widget speaks the next natural question on arrival — no "okay, continuing" fluff
- **No forced reconnect on user reload** — a `resumePending` flag in `sessionStorage` distinguishes agent-initiated nav from a plain `Cmd+R`, so a manual reload doesn't snap the user back into a call they didn't ask for
- **Visual state-preservation cues** — mascot stays in-call pose + red "RECONNECTING" button during the 1-2s WebSocket handshake, so the user can see state is being carried
- **First-visit reveal animation** — the playful collapsed→revealed animation plays once per tab, then skips on every subsequent load/resume
- **Automated ElevenLabs tests** — 4 test configs (`test_configs/`) verify the silent-nav + no-loop + tool-calling behavior via `elevenlabs agents test` before any prompt change ships
- **Pointer-events pass-through** — clicks go through the widget area to page content below, only the button captures clicks, via a sensor overlay + `pointer-events` toggling

## Prerequisites

- Node.js 18+
- pnpm 9+
- A MascotBot API key from <https://app.mascot.bot/api-keys>
  - `mascot_dev_…` — works on `localhost` / `127.0.0.1` / `*.localhost` (no billing)
  - `mascot_pub_…` — for your allow-listed production domains
- An [ElevenLabs](https://elevenlabs.io) account (agent + API key)
- ElevenLabs CLI: `npm install -g @elevenlabs/cli` (used for agent setup and tests)

## SDK install (private npm registry)

The MascotBot lipsync SDK ships from the private registry `https://npm.mascot.bot/`. A `.npmrc` is already committed in the `widget/` app; it reads the token from the `MASCOT_NPM_TOKEN` environment variable, so no secret is checked in.

Before installing, export the **same** `mascot_` key you use as the lipsync license key:

```bash
export MASCOT_NPM_TOKEN=mascot_dev_xxxxxxxxxxxxxx
```

There is no `.tgz` to download and no manual SDK step — `pnpm install:all` pulls `@mascotbot/core` and `@mascotbot/react` from the registry.

## Avatars

The Rive avatar file is **auto-downloaded** from the public, no-auth MascotBot Avatars API by `widget/scripts/fetch-avatars.mjs`, which runs automatically on the widget app's `predev` and `prebuild`. You do **not** supply any paid `.riv` file.

This template uses the `notion-guy-widget` avatar (artboard `Widget`, state machine `mascotStateMachine`) — the embeddable widget flavor. The downloaded `widget/public/mascot_widget.riv` stays gitignored.

## Quick Start

This template is **two apps** in one folder:

```
wordpress-embed-continuity/
├── widget/       ← the production artifact (deploy to widget.yourdomain.com)
└── demo-site/    ← a WordPress-simulating static site for local testing
```

### 1. Clone and install

```bash
git clone https://github.com/mascotbot-templates/wordpress-embed-continuity.git
cd wordpress-embed-continuity

export MASCOT_NPM_TOKEN=mascot_dev_xxxxxxxxxxxxxx   # same as your lipsync key

# Install dependencies for both apps (pulls the SDK from the private registry)
pnpm install:all
```

### 2. Provision the ElevenLabs agent (one command)

This creates the three client tools and the agent with continuity overrides enabled:

```bash
ELEVENLABS_API_KEY=sk_your_key pnpm --filter widget setup:agent
```

Copy the `ELEVENLABS_AGENT_ID` it prints.

### 3. Configure environment

```bash
cp widget/.env.example widget/.env.local
cp demo-site/.env.example demo-site/.env.local
```

Fill in `widget/.env.local`:

```
NEXT_PUBLIC_MASCOT_KEY=mascot_dev_xxxxxxxxxxxxxx
ELEVENLABS_API_KEY=sk_your_elevenlabs_key
ELEVENLABS_AGENT_ID=agent_xxx        # from step 2
```

`demo-site/.env.local` stays at its default (`NEXT_PUBLIC_WIDGET_URL=http://localhost:3004`) for local dev.

### 4. Run

```bash
pnpm dev        # spawns both apps — widget on :3004, demo-site on :3005
```

Open [http://localhost:3005](http://localhost:3005). Click the voice button bottom-right, say *"I need a moving estimate"* — the agent goes silent, the page reloads to `/estimate`, and the agent's next line is *"What's your name?"* with no audible seam.

## Environment Variables

This template is **two apps**, each with its own `.env.example`:

```bash
cp widget/.env.example      widget/.env.local       # API keys live here
cp demo-site/.env.example   demo-site/.env.local    # widget URL lives here
```

### `widget/.env.local`

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_MASCOT_KEY` | Browser-safe MascotBot lipsync key (`mascot_dev_…` for localhost, `mascot_pub_…` for production). Inlined into the client bundle. | Yes |
| `ELEVENLABS_API_KEY` | ElevenLabs API key. Server-side only — used by `/api/get-signed-url`. | Yes |
| `ELEVENLABS_AGENT_ID` | ElevenLabs Conversational-AI Agent ID with `prompt` + `first_message` overrides enabled (from the setup script). | Yes |
| `MASCOT_NPM_TOKEN` | Same `mascot_` key, exported in your shell (and set on your host) so `pnpm install` can authenticate to `https://npm.mascot.bot/`. Not read at runtime. | Install only |

### `demo-site/.env.local`

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_WIDGET_URL` | Widget URL — `http://localhost:3004` in dev, your deployed widget URL in prod | Yes |

## Architecture

### Deployment shape

```
WordPress page (yourdomain.com/contact)
   │ <script src="https://widget.yourdomain.com/widget.js">
   ▼
widget.js (vanilla JS embed script, ~7 KB)
   │ - creates <iframe src="widget.yourdomain.com"> + sensor overlay
   │ - toggles iframe pointer-events based on cursor position
   │ - listens for widget-navigate postMessage → window.location.href
   ▼
iframe: Next.js widget app (widget.yourdomain.com)
   │ - React component tree: MascotBot lipsync SDK + @elevenlabs/client
   │ - createElementTap() taps the ElevenLabs <audio>; visemes inferred in-browser
   │ - sessionStorage scoped to widget origin (survives parent reloads)
   │ - /api/get-signed-url mints an ElevenLabs signed URL (xi-api-key, server-side)
   ▼
ElevenLabs Conversational AI
   - prompt + first_message overrides enabled
   - 3 client tools: navigateTo, updateEstimateField, submitEstimate
```

### Continuity mechanism (the hard part)

ElevenLabs has **no native** "resume by conversation_id" — confirmed against `@elevenlabs/client@1.2.0`. Continuity is stitched client-side:

```
User speaks
   │
   ▼ SDK onMessage({message, source})
   │
appendTurn("user" | "ai", text)
   │
   ▼ synchronous sessionStorage write — no debounce, no beforeunload hook
   │
sessionStorage["mascotbot-continuity"] = { transcript: [...], facts: {...}, ... }

────────────────────────────────────────────────────────────
Agent calls navigateTo("/estimate")  →  widget-navigate postMessage
                                               │
                                               ▼
                                   embed script: window.location.href = "/estimate"
                                               │
                                               ▼
                                   HARD RELOAD — everything dies
────────────────────────────────────────────────────────────

Next page loads
   │
   ▼ widget iframe re-mounts (same origin → same sessionStorage)
   │
isResumable()  →  reads resumePending + transcript + freshness
   │
   ▼ true (agent-triggered nav)
   │
buildResumeOverrides(state)
   │   - overrides.agent.prompt.prompt = BASE_PROMPT + PRIOR_CONVERSATION block
   │   - overrides.agent.firstMessage  = page-aware line (e.g. "What's your name?")
   │   - dynamicVariables              = {current_page, is_resumed:"true", ...facts}
   │
   ▼
conversation.startSession({ signedUrl, overrides, dynamicVariables })
   │
   ▼ onConnect → callState = "connected", mascot stays in-call
```

### Data flow — tool calls

```
User speaks → ElevenLabs agent → client tool call
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              navigateTo     updateEstimateField   submitEstimate
                    │                 │                 │
                    ▼                 ▼                 ▼
    markResumePending()   setFacts + postMessage  postMessage
    postMessage to         widget-form-update      widget-form-submit
    widget-navigate         to parent               to parent
                    │                 │                 │
                    ▼                 ▼                 ▼
    parent does        demo-site form      demo-site shows
    window.location    input updates       confirmation screen
    .href = page       live
```

### Key files

| File | What it does |
|---|---|
| `widget/src/lib/continuity-store.ts` | sessionStorage buffer — `appendTurn`, `isResumable`, `markResumePending` |
| `widget/src/lib/continuity-overrides.ts` | Builds `startSession` overrides with stitched prompt + page-aware first message |
| `widget/src/lib/parent-bridge.ts` | Typed postMessage protocol between iframe and parent |
| `widget/src/components/widget.tsx` | The widget itself — Rive + button + SDK wiring + continuity orchestration |
| `widget/public/widget.js` | Hand-rolled vanilla-JS embed script — the one line hosts paste into their `<head>` |
| `widget/agent_configs/Wordpress-Embed-Assistant.json` | Canonical agent config (kept in sync with `scripts/setup-agent.mjs`) |
| `widget/test_configs/*.json` | Automated ElevenLabs agent tests — run via `elevenlabs agents test` |

## Iteration Loop (prompt + tests)

Every prompt change should go through the simulate/test loop before any voice test. This template ships 4 test configs that catch the bugs we hit while building:

```bash
# Push any prompt or config change
elevenlabs agents push

# Run the attached test suite
elevenlabs agents test $ELEVENLABS_AGENT_ID
```

| Test | What it guards |
|---|---|
| `Navigate-silently-on-estimate-request` | Agent calls `navigateTo(/estimate)` with NO narrative speech that would get cut off by the reload |
| `Navigate-silently-on-contact-request` | Same, for `/contact` |
| `Update-fields-when-user-gives-details` | Agent invokes `updateEstimateField` instead of just echoing back what the user said |
| `No-nav-loop-when-already-on-page` | Agent does NOT re-call `navigateTo` when the user is already on the destination page (the infinite reload loop we hit once and never want to hit again) |

## Lessons Learned

These are the real bugs we hit building this. You'll likely hit analogous ones in your own adaptation.

| What went wrong | Root cause | How we fixed it |
|---|---|---|
| Agent's closing line ("alright, taking you there…") got cut off mid-sentence by the reload | `conversation.isSpeaking` was captured by stale closure at tool-registration time; the "wait for silence" nav gate always fired immediately | Removed the gate entirely — prompt now forbids agent speech around `navigateTo`; the browser just reloads immediately and the agent speaks its next line on the new page |
| Agent went silent on resume, user had to say "hello" to wake it | `firstMessage: ""` parked the agent, and `sendContextualUpdate` does NOT trigger an agent turn | Page-aware deterministic `firstMessage` — `/estimate` → "What's your name?", `/contact` → "What's the best number to reach you back on?", etc. |
| After first resume, agent called `navigateTo` again → infinite reload loop | We tried to use `sendUserMessage("[__resume_continue__] on=/contact")` to wake the agent; the LLM parsed the path in the marker as a new nav request | Dropped the user-message trigger. Use only `firstMessage` override. Added a synthetic `[navigated silently to /estimate]` breadcrumb to the transcript buffer so the agent can SEE it already navigated. |
| Widget flashed collapsed/idle pose for ~1s after a resume reload, then jumped into the in-call pose | `customInputs.inCall` was synced via a `useEffect` that reads `conversation.status`, which lags behind `onRiveLoad`; the effect ran AFTER onRiveLoad and reset the input to false | Initialize `callState` synchronously via `useState(() => isResumable() ? "resuming" : "idle")` and drive the Rive `inCall` input from `callState`, not from the lagging `conversation.status` |
| Manual reload (`Cmd+R`) forcibly reconnected the user into a prior conversation they'd ended | `isResumable()` only checked `wasActive` + transcript presence | Added explicit `resumePending` flag — only set by `navigateTo` handler, cleared after successful resume. Plain reloads land on fresh `VOICE CHAT` button |
| Reveal animation never played | The Rive file has both `reveal` trigger AND `isRevealed` bool; we were setting the bool directly, which skipped the state machine's reveal transition | Fire `reveal` trigger via `rive.stateMachineInputs(...).fire()` in `onRiveLoad`, leave `isRevealed` at default. On subsequent visits/resumes, set `isRevealed=true` to snap past the animation |

## Production Deployment

### 1. Widget app → a public URL

Deploy `widget/` to Vercel (or any Next.js host). Set env vars in the dashboard — **do not commit them**:

- `NEXT_PUBLIC_MASCOT_KEY` — use a `mascot_pub_…` key allow-listed to the widget's production origin
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `MASCOT_NPM_TOKEN` — set as a **build-time** environment variable so `pnpm install` can authenticate to the private registry `https://npm.mascot.bot/`

Give it a memorable subdomain: `widget.yourdomain.com`.

The SDK is pulled from the private registry at install time (no `.tgz` to commit), and the avatar `.riv` is auto-fetched from the public Avatars API on `prebuild` (gitignored, never committed) — nothing private has to be bundled into the repo.

### 2. Install on any WordPress (or any) site

Add to your theme's `<head>` — via the "Insert Headers and Footers" plugin, or directly in `header.php`:

```html
<script src="https://widget.yourdomain.com/widget.js" async></script>
```

That's the entire install. No React, no plugin, no build step on the host side. The widget mounts itself in an iframe, the iframe's origin owns `sessionStorage`, and continuity works out of the box.

### 3. (Optional) Deploy the demo-site

Deploy `demo-site/` as a separate Vercel project with `NEXT_PUBLIC_WIDGET_URL=https://widget.yourdomain.com` — gives you a public sandbox to show prospects what the widget feels like.

## Customization

### Widget appearance

Edit `WIDGET_CUSTOMIZATION` in `widget/src/components/widget.tsx`:

```ts
const WIDGET_CUSTOMIZATION = {
  gender: 1,        // 1=male, 2=female
  outline: 10,
  colourful: true,
  shirt_color: 2,
  // ... see the file for all options
};
```

### Widget size

Edit the container in `PersistentWidget`:

```tsx
<div style={{ width: 300, height: 380, ... }}>
```

### Page-aware resume lines

Edit `firstMessageForPage` in `widget/src/lib/continuity-overrides.ts` to customize what the agent says on arrival at each page after a silent nav.

### Agent prompt

Two places — keep them in sync:
1. `widget/src/lib/agent-prompt.ts` — the constant stitched into resume prompt overrides (this is what the agent sees AFTER a nav)
2. `widget/scripts/setup-agent.mjs` — what gets pushed to ElevenLabs on initial setup (what the agent sees on fresh conversations)

After editing either, run `pnpm --filter widget setup:agent` (for fresh) or `elevenlabs agents push` (from `widget/` dir) to ship.

## Out of Scope (v1)

- **Cross-device continuity** — the user closes their laptop and reopens the tab on their phone. Requires server-side transcript storage keyed to a stable user ID; deferred.
- **Persistence across tab close** — sessionStorage dies with the tab. Intentional scope limit; use a real backend session if you need this.
- **WordPress plugin `.zip`** — the `<script>` tag covers 99% of WP installs. A proper plugin is a trivial wrapper if a client insists.
