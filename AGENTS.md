# AGENTS.md - Su-kai working rules

## Project

Target repo:

`/Users/nikki/Documents/Codex/2026-06-25/applications-mentioned-by-the-user-appshot/work/Su-kai-yuan-kai-prompt`

Production/data-bearing URL:

`https://su-beige.vercel.app/?v=<build-version>`

Important: the query `?v=` is only a cache buster. The storage-bearing origin is always:

`https://su-beige.vercel.app`

Do not use preview URLs when verifying user data, IndexedDB, localStorage, PWA behavior, API settings, Memory Palace settings, character data, or saved chat behavior unless explicitly asked.

## Current Implementation Context

This is a Vite React TypeScript mobile web app. Follow the existing React/TypeScript patterns and do not introduce a different app framework.

Core areas:

- `apps/Chat.tsx`
  - Main private chat screen, message composition, optimistic user-message display, card-share conversion, and chat-side hook wiring.
  - Do not overwrite this file wholesale. Make narrow edits and preserve existing UI and saved-message behavior.

- `utils/chatPrompts.ts`, `utils/messageFormat.ts`, and YuanKai prompt-layer utilities
  - Legacy Su-kai prompt formatting and YuanKai-style prompt generation must not double-inject the same memory/worldbook content.
  - YuanKai internal tags such as status, thought, and illustration hints must be stripped from visible chat text.

- `utils/memoryPalace/*`
  - Memory Palace retrieval, embedding/rerank provider integration, local IndexedDB storage, Supabase pgvector option, and BM25 fallback.
  - OpenRouter support should stay provider-aware and prompt-mode independent.
  - Do not expose prompt text, memory text, API keys, or embedding request bodies in logs/UI.

- `apps/MemoryPalaceApp.tsx`
  - Memory Palace settings UI for provider, embedding model, rerank model, and connection checks.
  - Keep manual model input and safe fallback behavior.

- `context/OSContext.tsx`, `types.ts`
  - Shared app state, API config, Memory Palace config, character config, and persistence-facing types.
  - Keep old saved config backward compatible.

- `utils/autoIllustration/*` and NovelAI-related settings
  - Private-chat auto illustration is background work after assistant text is saved/displayed.
  - Do not block visible chat reply on image generation.
  - Never log NovelAI tokens or secret-bearing provider config.

- `utils/characterCardImport.ts`, `apps/Character.tsx`
  - Character card import path for Su-kai JSON, SillyTavern/TavernAI JSON, and PNG cards.
  - Keep existing `CharacterProfile`/IndexedDB save format compatible.

- `worker/*`, `public/sw-keep-alive.js`, `index.html`
  - PWA/service-worker/version/cache behavior.
  - When a production mobile/PWA fix must be reflected, bump the relevant version/cache touchpoints together.

## High-Level Working Policy

Always prefer small, behavior-preserving changes.

When asked to organize, split, or reduce tangled code:

1. Pick exactly one small theme.
2. Do not redesign UI.
3. Do not change DB schema.
4. Do not change save formats.
5. Do not add new libraries unless explicitly needed.
6. Do not mix refactor with new features.
7. Extract thin helpers/wrappers first.
8. Keep existing function names and event flows where possible.
9. Keep diffs minimal.
10. Do not refactor unrelated code.
11. Verify changed TypeScript with focused tests/build when practical.

## Current Commit / Deploy Convention

For this thread's current working convention:

- After code changes, automatically commit / push / deploy unless the user explicitly says to stop.
- If there are unrelated dirty files, do not stage them. Report them and stage only intended files.
- Never revert user changes unless explicitly requested.
- Do not work directly on `main` or `master` unless the user explicitly requests it. If on `main`/`master`, propose or create a work branch before edits.

## Safety Rules

Never log or display:

- API keys
- tokens
- Authorization headers
- request bodies
- full prompts
- system prompts
- full memory text
- raw chat history dumps
- NovelAI tokens
- embedding request bodies
- character-card raw payloads that may include private prompt/history text

Diagnostics should be safe metadata only:

- counts
- booleans
- modes
- sources
- short error type
- short safe error message
- hashes if needed

Good diagnostics examples:

- `selected: 3`
- `injectedCount: 12`
- `source: "memory-palace"`
- `mode: "fallback-appended"`
- `safeErrorType: "AbortError"`

Bad diagnostics examples:

- raw prompt
- raw memory content
- API payload
- secret-bearing config
- full imported card JSON

## UI Rules

Do not change UI appearance unless explicitly asked.

For UI migration tasks:

- Treat as relocation, not redesign.
- Reuse original component, props, className, CSS, event handlers, and rendering conditions whenever possible.
- Do not restyle to match the destination screen unless explicitly requested.
- Avoid new components if the existing component can be moved or extracted.
- Preserve spacing, typography, icons, hover/focus states, responsive behavior, and conditional rendering.
- Keep diffs minimal.
- Do not refactor unrelated code.
- Before editing, identify source component and destination component.
- After editing, summarize visual/behavioral differences. If none were intended, say so.

For mobile chat UI:

- Keep message save/display behavior separate from AI reply generation.
- Do not let floating debug/build overlays block the input bar on mobile.
- Prefer visible, low-friction error feedback over losing typed user input.

## Browser / E2E Notes

For Su-kai saved-data verification, use production origin:

`https://su-beige.vercel.app/?v=<fresh-build-version>`

Do not switch to preview origin for saved-data checks.

For real chat reply E2E:

- API consumption is allowed when needed and explicitly relevant.
- Keep all diagnostics secret-safe and content-safe.
- Do not assume a send-control bug is fixed until the typed text remains safe through failed-save and slow-reload paths.

Known production URL:

- `https://su-beige.vercel.app`

Known current build/cache marker:

- `?v=1.15.3`

## Version / Cache Rules

Before production deploys that change app behavior, PWA behavior, service worker behavior, local static assets, or app metadata, bump all relevant production cache/version touchpoints together. Docs-only changes do not require a version bump.

Su-kai version/cache touchpoints:

- `worker/sw-keep-alive.ts`
  - Bump `SW_VERSION` when service worker behavior, mobile/PWA refresh behavior, push handling, notification behavior, IDB handling, or cache-busting behavior must change.
- `public/sw-keep-alive.js`
  - Regenerate from `worker/sw-keep-alive.ts` with `node scripts/build-workers.mjs`.
  - Keep this generated file in sync with the TypeScript source.
- `utils/keepAlive.ts`
  - The current registration target is `sw-keep-alive.js`.
  - Only change the registration URL/query strategy when intentionally changing how the browser discovers or refreshes the service worker.
- `index.html`
  - Vite normally emits hashed JS/CSS assets, so manual query-string bumps are usually unnecessary.
  - If local non-hashed scripts/styles or explicit query strings are added later, bump changed local JS/CSS query strings together.
- `public/manifest.webmanifest`, `metadata.json`, and app icons
  - Bump/cache-refresh only when manifest/PWA metadata, icon, app name, display mode, or related install metadata changes.

Use the same build/cache version in the final production URL when a version bump is relevant:

`https://su-beige.vercel.app/?v=<version>`

Phone/PWA may require closing/reopening the app, refreshing with the new query, or waiting for the new service worker to activate.

## Standard Checks

For changed JavaScript or generated service-worker JavaScript:

```bash
node --check <changed-js-files>
```

For changed TypeScript/React paths, prefer focused Vitest runs when available, then run:

```bash
./node_modules/.bin/vite build
```

Always run:

```bash
git diff --check
```

Secret/danger scan over changed files or diff:

```bash
git diff -- <changed-files> | rg -n "^\\+.*(api[K]ey|Authori[z]ation|Bear[e]r|backend[T]oken|toke[n]|request[B]ody|system[P]rompt|console\\.lo[g]|console\\.erro[r])"
```

No output is expected. Exit code 1 from `rg` means no matches and is fine.

Local smoke for the built static app:

```bash
./node_modules/.bin/vite build
cd dist
python3 -m http.server 4173 --bind 127.0.0.1
curl -I 'http://127.0.0.1:4173/?v=<version>'
curl -I 'http://127.0.0.1:4173/sw-keep-alive.js'
curl -I 'http://127.0.0.1:4173/manifest.webmanifest'
```

If binding to `127.0.0.1` is blocked by sandbox, rerun the server command with escalation.

Check port:

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN
```

## Git / Auth Notes

Run from repo root:

`/Users/nikki/Documents/Codex/2026-06-25/applications-mentioned-by-the-user-appshot/work/Su-kai-yuan-kai-prompt`

Always start with:

```bash
git status -sb
git branch --show-current
```

GitHub auth may look broken inside sandbox. If `gh auth status` fails in sandbox, retry with escalated/outside-sandbox execution before assuming auth is invalid.

Useful preflight:

```bash
git status -sb
gh auth status
gh repo view --json nameWithOwner,visibility,url
npx --yes vercel@latest --version
test -f .vercel/project.json && cat .vercel/project.json
test -f vercel.json && cat vercel.json
```

Expected repo:

`makemegreat55-spec/Su-kai`

Expected production alias:

`https://su-beige.vercel.app`

Before publishing:

```bash
git diff --check
./node_modules/.bin/vite build
```

Use focused Vitest runs for touched areas when available, and run the full suite for shared prompt, memory, chat, import, or persistence paths.
