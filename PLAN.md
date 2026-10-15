# MyTrip — v1 To-Do

Tick items (`- [x]`) as they're completed. Design details, data model, assumptions and risks are in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

**Done means:** `npx expo lint` and `npx tsc --noEmit` pass, and the feature works on iOS and Android.

---

## Phase 0 — Foundations & spikes

### Project setup
- [x] Remove leftover template code; clean `src/app/index.tsx` and `_layout.tsx`
- [x] Set `web.output: "server"` in `app.json` (required for API routes)
- [ ] Set up folder structure: `src/server`, `src/shared`, `src/features`, `src/components`, `src/lib`
- [x] Configure `@/` path alias in `tsconfig.json`
- [ ] Create EAS project (`npx eas-cli@latest init`) and `eas.json` with `development` / `production` profiles
- [ ] Add `.env.example` documenting every required env var
- [ ] Set up Vitest for `src/server` and `src/shared`

### Accounts & keys (dev)
- [x] Clerk dev instance with Google + Apple connections enabled
- [x] Neon project with `main` (prod) and `dev` branches
- [x] Inngest account + dev environment
- [x] Anthropic API key
- [x] Unsplash developer app (demo tier)
- [x] ImageKit account (URL endpoint, public/private keys)
- [x] Sentry project (React Native)

### Spikes (prove before building)
- [ ] Deploy a hello-world `+api.ts` to EAS Hosting
- [ ] Neon + Drizzle query works from a deployed API route
- [ ] `inngest/edge` serve handler works at `/api/inngest` on EAS Hosting and syncs with Inngest Cloud
- [ ] Inngest step makes a ~60s streamed Claude Sonnet 5.5 call on EAS Hosting without being cut off
- [ ] Server-side Sentry captures an error from an API route (or fallback chosen and documented)
- [ ] Cost test: generate 3 / 7 / 14-day sample trips at effort `low` and `medium`; record tokens, latency, $ and quality
- [ ] Record spike results and any fallback decisions in `docs/IMPLEMENTATION_PLAN.md`

---

## Phase 1 — Auth & app shell

- [x] Install Clerk packages (`@clerk/expo`, `expo-secure-store`, `expo-crypto`, `expo-apple-authentication`, `expo-auth-session`) + config plugins
- [x] Create a development build (iOS + Android)
- [x] `ClerkProvider` with secure-store token cache in root layout
- [x] Auth screen (`(auth)/sign-in.tsx`) with "Continue with Google" (browser SSO)
- [x] "Continue with Apple" on the same screen (native on iOS, browser SSO on Android)
- [x] Protected routing: signed-out → sign-in, signed-in → `(app)` stack
- [x] Sign out
- [ ] Client API wrapper (`lib/api.ts`) that attaches the Clerk session token
- [ ] Server `requireUser()`: verify Clerk token with `@clerk/backend`, return 401 if invalid
- [x] User sync (created): Clerk `user.created` webhook (`/api/webhooks/clerk`) → Inngest `clerk/user.created` → `sync-user-created` inserts into Neon
- [x] User sync (updated): `user.updated` → Inngest `clerk/user.updated` → `sync-user-updated` upserts the row (safe if it arrives before the create)
- [x] User sync (deleted): `user.deleted` → Inngest `clerk/user.deleted` → `sync-user-deleted` deletes the row
- [x] Sentry React Native setup (manual Expo setup: config plugin, Metro, `Sentry.init`, `Sentry.wrap`)
- [ ] Tag Sentry events with the Clerk user id
- [x] Prevent `(app)` screens from rendering on web

---

## Phase 2 — Database & core API

- [x] Drizzle client using Neon HTTP driver
- [x] Schema: `users`
- [ ] Schema: `trips` (inputs, JSONB outputs, status, cover, share token, generation version)
- [ ] Schema: `generations` (caps, refunds, token usage, cost)
- [ ] Schema: `unsplash_cache`
- [ ] Migrations generated and applied to `dev` branch
- [ ] Shared Zod schemas: trip input, trip output (Day, Activity, Hotel, Budget), API errors
- [ ] Standard API error response shape + helper
- [ ] `GET /api/me`
- [ ] `GET /api/trips` (list, summary fields only)
- [ ] `POST /api/trips` (validate → cap check → insert trip + generation → send Inngest event)
- [ ] `GET /api/trips/:id` (owner only)
- [ ] `GET /api/trips/:id/status` (lightweight, for polling)
- [ ] `DELETE /api/trips/:id`
- [ ] Daily caps: 5 trips / 20 day-regenerations per rolling 24h, failed ones don't count
- [ ] `CAP_REACHED` (429) response includes `resetsAt`
- [ ] Unit tests: cap logic, refund on failure, `requireUser`, input validation

---

## Phase 3 — AI generation pipeline

### Claude
- [ ] Anthropic client (Sonnet 5.5, streaming, structured output, refusal fallback)
- [ ] System prompt (cached) + skeleton prompt + per-day prompt
- [ ] Handle `refusal` / `max_tokens` stop reasons as retryable failures
- [ ] Record token usage and cost on the `generations` row

### Inngest
- [x] Inngest client + `/api/inngest` route (dev mode)
- [ ] `generate-trip` function: load → plan skeleton → generate days in parallel → images → save
- [ ] Per-user concurrency limit and retries (3)
- [ ] Idempotency (event id = generation id)
- [ ] Version guard so stale jobs can't overwrite a regenerated trip
- [ ] `onFailure`: mark trip + generation `failed` (refund), user-safe error message, report to Sentry
- [ ] `regenerate-day` function (single day; restore previous day on failure)
- [ ] Whole-trip regeneration (bump version, reset outputs, re-send event)
- [ ] Local dev workflow with Inngest Dev Server documented in README

### Unsplash
- [ ] Unsplash search client
- [ ] Cache lookups in `unsplash_cache` (dedupe queries, limited concurrency)
- [ ] Store photographer attribution + trigger download tracking endpoint
- [ ] Hero image for destination
- [ ] Image per hotel and per activity
- [ ] Graceful fallback when no image / rate limited (placeholder, trip still succeeds)

### Tests
- [ ] Zod schemas accept valid sample outputs, reject truncated/invalid ones
- [ ] Version guard unit test

---

## Phase 4 — Core screens

### Data layer
- [ ] TanStack Query provider + query keys
- [ ] Persisted query cache (viewed trips readable offline)
- [ ] Offline banner
- [ ] Polling every ~2.5s while a trip is `pending` / `generating`

### Home
- [ ] Trip list with destination, dates, cover/hero thumbnail and status badge (Generating / Ready / Failed)
- [ ] Empty state: "Plan your first trip"
- [ ] "New trip" button
- [ ] Pull to refresh
- [ ] Remaining daily generations hint

### New Trip form
- [ ] Destination (free text)
- [ ] Start date picker
- [ ] Number of days (1–14)
- [ ] Number of travelers (1–10)
- [ ] Traveler type (solo / couple / family / friends)
- [ ] Budget amount + currency picker
- [ ] Interests (multi-select chips)
- [ ] Pace (relaxed / balanced / packed)
- [ ] Inline validation with shared Zod schema
- [ ] Submit → navigate to trip detail in generating state
- [ ] Friendly message when daily cap is reached

### Trip Detail
- [ ] Generating state (loading animation, "you can leave this screen")
- [ ] "Taking longer than usual" message after ~3 min
- [ ] Failed state with "Try again"
- [ ] Header: hero image or custom cover, destination, dates, travelers
- [ ] Overview + travel tips
- [ ] Budget breakdown (lodging, food, transport, activities, misc, total)
- [ ] Hotel suggestion cards
- [ ] Day tabs/sections with morning / afternoon / evening activities
- [ ] Activity cards (name, description, est. cost, duration, image)
- [ ] Unsplash photographer attribution
- [ ] "AI-generated — verify before booking" disclaimer

---

## Phase 5 — Trip actions & sharing

- [ ] Delete trip (with confirmation)
- [ ] Regenerate whole trip (with confirmation, counts against trip cap)
- [ ] `POST /api/trips/:id/regenerate`
- [ ] Regenerate a single day (per-day loading state, other days untouched)
- [ ] `POST /api/trips/:id/days/:day/regenerate`
- [ ] `POST /api/trips/:id/share` (create/rotate token) and `DELETE` (revoke)
- [ ] Share button → native share sheet with link
- [ ] Revoke share link UI
- [ ] `GET /api/share/:token` (public, no user data)
- [ ] Web share page `/share/[token]`: responsive, read-only, Open Graph tags
- [ ] Unit test: share route never returns user data

---

## Phase 6 — ImageKit (avatars & custom covers)

- [ ] `GET /api/uploads/auth` (signed upload params, user-scoped folder)
- [ ] Image picker (library + camera) with crop (avatar 1:1, cover 16:9)
- [ ] Camera / photo library permission strings in `app.json`
- [ ] Resize + convert to JPEG on device before upload (max 2000px, ≤10 MB)
- [ ] Direct upload from device to ImageKit with progress + error handling
- [ ] `PUT/DELETE /api/me/avatar` with folder-ownership check
- [ ] Avatar on Profile: show Clerk avatar by default, custom avatar when set
- [ ] `PUT/DELETE /api/trips/:id/cover` with folder-ownership check
- [ ] "Change cover" + "Reset to default" on Trip Detail
- [ ] ImageKit URL helper with transforms (sizes, auto format/quality)
- [ ] `delete-imagekit-file` Inngest function (on replace, trip delete, account delete)
- [ ] Unit test: path-ownership check

---

## Phase 7 — Account & hardening

- [ ] Profile screen (avatar, name, email, sign out)
- [ ] Delete account: Neon data → queue ImageKit cleanup → delete Clerk user
- [ ] `DELETE /api/me`
- [ ] Rate limiting on trip creation (per user + per IP)
- [ ] Request body size limits on API routes
- [ ] Error / empty / slow-network states reviewed on every screen
- [ ] Accessibility pass: labels, dynamic type, contrast, touch targets
- [ ] Dark mode check on every screen

---

## Phase 8 — Release

- [ ] EAS environment variables for `development` and `production`
- [ ] Clerk production instance (Apple Services ID, Google OAuth clients)
- [ ] Neon production branch + migrations applied
- [ ] Inngest production environment + keys
- [ ] Unsplash production access approved
- [ ] Sentry source maps for builds (`SENTRY_AUTH_TOKEN`) and updates
- [ ] `eas deploy --prod` (API routes + share page)
- [ ] App icon, splash screen, store metadata, privacy policy URL
- [ ] Production builds (`eas build`)
- [ ] TestFlight + Android internal testing
- [ ] Manual QA matrix passed on iOS and Android devices
- [ ] Submit to App Store and Google Play (`eas submit`)

---

## Manual QA matrix (run before release)

- [ ] Sign in with Google (iOS + Android)
- [ ] Sign in with Apple (iOS native + Android browser flow)
- [ ] Generate 1-day, 7-day and 14-day trips
- [ ] Leave the app mid-generation, return, trip is ready
- [ ] Generation failure shows "Try again" and doesn't use a credit
- [ ] Daily cap reached message
- [ ] Airplane mode: cached trip still readable
- [ ] Regenerate one day
- [ ] Regenerate whole trip
- [ ] Share link opens in a browser; revoked link stops working
- [ ] Upload avatar and trip cover (camera + library)
- [ ] Delete trip
- [ ] Delete account removes data and signs out
- [ ] Errors appear in Sentry (client + server)
