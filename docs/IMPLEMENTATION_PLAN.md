# MyTrip — Implementation Plan (v1)

> Source of truth for v1 scope. Spec agreed 2026-10-14. Versions checked against npm the same day.

## 0. Snapshot

| Area | Decision |
|---|---|
| App | Expo SDK 57 (`expo ~57.0.28`), RN 0.86, React 19.2, Expo Router, npm |
| Platforms | iOS + Android. Web = one public share route only |
| Auth | Clerk (`@clerk/expo` 4.11, peer `expo >=54 <58` ✓) — Google via browser SSO, Apple native on iOS / browser SSO elsewhere; dev build required |
| Backend | Expo Router API routes (`+api.ts`) on **EAS Hosting (Cloudflare Workers runtime)** |
| DB | Neon Postgres via `@neondatabase/serverless` (HTTP) + Drizzle ORM |
| Jobs | Inngest (`inngest` 4.x, `inngest/edge` serve handler) |
| AI | Claude **Sonnet 5.5** (`claude-sonnet-5-5`, $2 / $10 per MTok in/out) via `@anthropic-ai/sdk` |
| Place images | Unsplash API (hotlinked + attributed) |
| User images | ImageKit — avatars + custom trip covers (direct signed upload) |
| Monitoring | Sentry (`@sentry/react-native`); server SDK TBD in Phase 0 |
| Client data | TanStack Query v5 + persisted cache (offline read of viewed trips) |
| Envs | dev + prod (Neon branch, Clerk instance, Inngest env, EAS env per stage) |

---

## 1. Project structure

```
src/
  app/                              # routes only
    _layout.tsx                     # providers: Clerk, QueryClient, Sentry, Stack.Protected
    sign-in.tsx                     # Google / Apple buttons
    (app)/
      _layout.tsx                   # signed-in stack
      index.tsx                     # Home: trip list + empty state + "New trip"
      profile.tsx                   # avatar, sign out, delete account
      trips/new.tsx                 # create form
      trips/[id]/index.tsx          # detail (renders generating state when not ready)
    share/[token].tsx               # public read-only web page (web only)
    api/
      inngest+api.ts                # Inngest serve (GET/POST/PUT)
      me+api.ts                     # GET profile, DELETE account
      me/avatar+api.ts              # PUT/DELETE avatar
      trips+api.ts                  # GET list, POST create
      trips/[id]+api.ts             # GET trip, DELETE trip
      trips/[id]/status+api.ts      # GET lightweight status (polling)
      trips/[id]/regenerate+api.ts  # POST whole-trip regen
      trips/[id]/days/[day]/regenerate+api.ts
      trips/[id]/cover+api.ts       # PUT/DELETE custom cover
      trips/[id]/share+api.ts       # POST create token, DELETE revoke
      share/[token]+api.ts          # GET public trip (no auth)
      uploads/auth+api.ts           # GET ImageKit signed upload params
  server/                           # server-only, never imported by screens
    db/{client,schema}.ts
    auth.ts                         # requireUser(request) → verify Clerk token + upsert user
    limits.ts                       # cap checks
    ai/{client,prompts,schemas}.ts  # Claude calls + Zod output schemas
    inngest/{client,functions/*}.ts
    unsplash.ts
    imagekit.ts
  features/                         # screen-level components + hooks per feature
    trips/  profile/  auth/
  components/                       # shared UI
  lib/                              # api client (fetch + Clerk token), query keys, formatters
  shared/                           # Zod schemas + types shared by client and server
drizzle/                            # migrations
```

Rules: client code calls only `/api/*`. No secrets have the `EXPO_PUBLIC_` prefix. Zod schemas in `shared/` are the contract for both sides.

---

## 2. Data model (Drizzle / Postgres)

```
users
  id                text PK          -- Clerk user id
  email             text
  name              text
  clerk_image_url   text
  avatar_file_id    text null        -- ImageKit
  avatar_path       text null
  created_at, updated_at

trips
  id                uuid PK
  user_id           text FK users ON DELETE CASCADE
  status            enum('pending','generating','ready','failed')
  error             text null
  -- inputs
  destination_input text  (1–120 chars)
  start_date        date
  days              int   (1–14)
  travelers         int   (1–10)
  traveler_type     enum('solo','couple','family','friends')
  budget_amount     numeric(12,2) > 0
  currency          char(3)          -- ISO 4217, from a short list
  interests         text[]
  pace              enum('relaxed','balanced','packed')
  -- outputs (Zod-validated JSONB)
  destination       jsonb null       -- { city, country, summary }
  overview          jsonb null       -- { summary, tips[] }
  budget_breakdown  jsonb null       -- { lodging, food, transport, activities, misc, total, currency, notes }
  hotels            jsonb null       -- Hotel[]
  itinerary         jsonb null       -- Day[] (each Day has its own status for day regen)
  hero_image        jsonb null       -- UnsplashImage
  cover_file_id     text null        -- ImageKit custom cover
  cover_path        text null
  share_token       text unique null -- 32+ char random
  model             text
  generation_version int default 0   -- bumps on each regen; stale job writes are ignored
  created_at, updated_at, generated_at
  INDEX (user_id, created_at desc)

generations                          -- caps, refunds, cost tracking
  id            uuid PK
  user_id       text FK ON DELETE CASCADE
  trip_id       uuid FK ON DELETE SET NULL
  kind          enum('trip','day')
  day_number    int null
  status        enum('queued','running','succeeded','failed')
  input_tokens, output_tokens  int
  cost_usd      numeric(10,5)
  error         text null
  created_at, finished_at
  INDEX (user_id, kind, created_at)

unsplash_cache                       -- protects Unsplash rate limit
  query_key     text PK              -- normalized "place, city, country"
  photo         jsonb                -- { url, blurHash, width, height, photographer, photographerUrl, unsplashUrl, downloadLocation }
  fetched_at    timestamptz
```

JSON shapes (in `shared/trip-schema.ts`):
- `Day { dayNumber, date, title, summary, status: 'ready'|'regenerating'|'failed', slots: { morning: Activity[], afternoon: Activity[], evening: Activity[] } }`
- `Activity { name, description, category, estCost, durationMins, area, image? }`
- `Hotel { name, area, description, pricePerNight, whyRecommended, image? }`

**Caps:** a request is rejected if the user already has `count(generations where kind=X and status != 'failed' and created_at > now() - 24h) >= limit`, with trip = 5 and day = 20. Failed generations don't count, so failures are refunded automatically. The check and the insert run in one SQL statement (`INSERT … SELECT … WHERE (subquery) < limit RETURNING id`). That makes double-tapping safe enough for v1.

---

## 3. Generation pipeline (Inngest)

**Event:** `trip/generate.requested { tripId, generationId, version }`. The event `id` is `generationId`, which makes it idempotent.

**Function:** `generate-trip`, with `concurrency: { key: event.data.userId, limit: 2 }` and `retries: 3`.

1. `step.run('load')`: load the trip. Abort if `version` is not the trip's current `generation_version`. Set the trip to `generating` and the generation to `running`.
2. `step.run('plan')`: Claude call #1 produces the **skeleton**: normalized destination, overview and tips, budget breakdown, 3–5 hotels, and one theme per day. This output is small.
3. `step.run('day-N')` × days, run in parallel with `Promise.all`: Claude call per day produces that day's activities, given the skeleton plus the user's inputs. Splitting the work keeps each Worker request short. It also means **regenerating one day uses the same code**.
4. `step.run('images')`: Unsplash lookup for the hero image, each hotel and each activity. Read `unsplash_cache` first, and only call Unsplash for cache misses (de-duplicated, about 10 concurrent at most).
5. `step.run('save')`: write the JSONB and set `status=ready` and `generated_at`. Set the generation to `succeeded` with token usage and cost. All writes are guarded by `WHERE generation_version = $version`.
6. `onFailure`: set the trip to `failed` with a user-safe message and the generation to `failed`, which refunds it. Report to Sentry.

**Day regeneration:** `trip/day.regenerate.requested { tripId, day, generationId, version }`. It marks that day `regenerating`, runs steps 3 → 4 → 5 for that one day, and restores the previous day plus `failed` status on error.

**Whole-trip regeneration:** bumps `generation_version`, resets the outputs and status to `pending`, and sends a new generate event. Any job still running from the old version can no longer write.

**Claude call settings:**
- `model: 'claude-sonnet-5-5'`
- Structured output through `output_config.format` / `messages.parse` with the Zod schemas from `shared/`
- Streaming with `.finalMessage()` so long outputs don't hit timeouts
- `output_config.effort: 'medium'`, to be tuned in Phase 0
- Server-side refusal fallback: `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`
- Always check `stop_reason` (`refusal` and `max_tokens` count as failures and trigger a retry)
- Prompt caching on the static system prompt
- Record `usage` on the generation row

**Cost estimate (to verify in Phase 0):** about 3–4K input tokens and 10–15K output tokens (including thinking) per 7-day trip, which is roughly **$0.10–0.16 per trip**. The worst case is about $0.80 per user per day at the cap.

**Client while waiting:** the detail screen polls `GET /api/trips/:id/status` every 2.5s while the status is `pending` or `generating`. Home polls only while any trip is generating. After 3 minutes the screen shows "Taking longer than usual…" but keeps the trip; the user can leave and come back.

---

## 4. ImageKit uploads

1. `GET /api/uploads/auth?purpose=avatar|cover&tripId=` checks that the user owns the trip and returns short-lived signed upload parameters plus the allowed `folder` (`/users/{userId}/avatars` or `/users/{userId}/covers/{tripId}`) and a generated `fileName`.
2. On the client: `expo-image-picker` (library or camera, `allowsEditing`, 1:1 avatar or 16:9 cover), then `expo-image-manipulator` to resize to 2000px on the long edge, convert to JPEG and compress. This sidesteps HEIC. The app then uploads directly to ImageKit.
3. `PUT /api/me/avatar` or `PUT /api/trips/:id/cover { fileId, filePath }`. The server checks that `filePath` starts with the user's folder, saves it, and sends `image/delete.requested` for the file being replaced.
4. **Display:** build the ImageKit URL from `path` plus a transform (for example `tr=w-96,h-96,fo-face` for avatars, `tr=w-1200,ar-16-9` for covers, and automatic format and quality), rendered with `expo-image`.
5. **Cleanup function:** `delete-imagekit-file`. Triggers are a replaced image, a deleted trip and a deleted account. It retries 5 times, and a 404 counts as success.

---

## 5. API surface

Every route except `/api/share/*` and `/api/inngest` calls `requireUser(request)`. That verifies the Clerk session token from `Authorization: Bearer`, upserts the user lazily, and returns a 401 otherwise. All inputs are Zod-validated, and errors use the shape `{ error: { code, message } }`.

| Method | Route | Notes |
|---|---|---|
| GET | `/api/me` | profile with resolved avatar URL |
| DELETE | `/api/me` | delete Neon data → queue ImageKit cleanup → delete Clerk user |
| PUT/DELETE | `/api/me/avatar` | |
| GET | `/api/trips` | list (summary fields only) |
| POST | `/api/trips` | validate → cap check → insert trip + generation → send event → `201 {id}`; `429 CAP_REACHED` with `resetsAt` |
| GET | `/api/trips/:id` | full trip (owner only) |
| GET | `/api/trips/:id/status` | `{ status, days: [{n,status}], updatedAt }` |
| DELETE | `/api/trips/:id` | + cleanup cover |
| POST | `/api/trips/:id/regenerate` | trip cap |
| POST | `/api/trips/:id/days/:day/regenerate` | day cap; 409 if trip not `ready` |
| PUT/DELETE | `/api/trips/:id/cover` | |
| POST/DELETE | `/api/trips/:id/share` | create/rotate or revoke token |
| GET | `/api/share/:token` | public; no user info; `Cache-Control` short |
| GET | `/api/uploads/auth` | |
| GET/POST/PUT | `/api/inngest` | signing key verified by SDK |

---

## 6. Phases

Each phase ends green on `npx expo lint` and `npx tsc --noEmit`.

### Phase 0 — Foundations and spikes (de-risk first)
- Clean up the template. Set `web.output: "server"` in `app.json` (it is currently `"static"`, which doesn't support API routes). Add the `@/` path alias and set up `eas init`.
- Deploy a hello `+api.ts` to EAS Hosting, then **spike** all of the following in a deployed route:
  - Neon HTTP query + Drizzle.
  - `inngest/edge` serve handler, registered with Inngest Cloud. Check that `AsyncLocalStorage` / `async_hooks` work.
  - One Inngest step that streams a long Sonnet 5.5 call (about 60s). This confirms EAS Hosting doesn't cut the request off.
  - Server-side Sentry: try `@sentry/cloudflare` (or the core SDK) inside an API route. Fall back to Inngest failure handlers that report through Sentry's HTTP API.
- **Cost test:** generate 5 sample trips (3, 7 and 14 days), then record tokens, latency and quality at effort `low` and at `medium`.
- **Exit criteria:** all spikes pass, or a documented fallback is chosen (e.g. move `/api/inngest` to a small Hono worker).

### Phase 1 — Auth and app shell
- `npx expo install @clerk/expo expo-secure-store expo-crypto expo-apple-authentication expo-auth-session expo-web-browser`, add the config plugins, then build a dev build (`eas build --profile development`).
- `(auth)/sign-in.tsx` uses `useSSO` (`oauth_google`) for Google, and for Apple `useSignInWithApple` on iOS or `useSSO` (`oauth_apple`) elsewhere. `(auth)` and `(app)` layouts guard on `useAuth()` (`isLoaded` then `isSignedIn`).
- `lib/api.ts`: a fetch wrapper that attaches `await getToken()`. Server `requireUser` uses `@clerk/backend` to verify tokens.
- Set up Sentry with the wizard (`npx @sentry/wizard@latest -i reactNative`) and attach the Clerk user ID.

### Phase 2 — Database and core API
- Drizzle schema and migrations, with a Neon `dev` branch and `main` for prod.
- `trips` CRUD, the `status` route, and cap logic with unit tests.

### Phase 3 — Generation pipeline
- Zod output schemas, prompts, the Claude client, and the `generate-trip` and `regenerate-day` functions, with `onFailure`, the version guard and usage logging.
- Unsplash client with caching, attribution data and download-endpoint tracking.
- Local workflow: Inngest Dev Server (`npx inngest-cli@latest dev`) against `expo start`.

### Phase 4 — Core screens
- **Home:** list with status badges, empty state, pull-to-refresh, cap-remaining hint.
- **New Trip form:**
  - Fields: destination, date picker, days stepper, travelers stepper, traveler type, budget + currency, interests chips, pace.
  - Validation uses the shared Zod schema. A `CAP_REACHED` error shows a friendly message.
- **Trip Detail:**
  - Hero image (or custom cover) and an overview with tips.
  - Budget breakdown (bar / list), hotel cards, and day tabs with morning, afternoon and evening sections.
  - Unsplash attribution and a "verify before booking" disclaimer.
  - Generating / failed states with "Try again".
- TanStack Query with a persisted cache (cached trips render offline, plus an offline banner) and `refetchInterval` while a trip is generating.

### Phase 5 — Trip actions and sharing
- Delete (with confirm), regenerate trip, and regenerate day (per-day spinner, no other day affected).
- **Share:** create the token, then use `expo-sharing` / the RN `Share` sheet to send `https://<eas-domain>/share/<token>`.
- `share/[token].tsx` is a responsive read-only web page with Open Graph tags, and it never redirects into the native-only routes.

### Phase 6 — ImageKit
- Upload auth route, picker + manipulator flow, avatar on Profile, cover on Trip Detail with "Reset to default", and the cleanup function.

### Phase 7 — Account and hardening
- Delete account (App Store requirement), sign out, and the Profile screen.
- Rate-limit `POST /api/trips` per IP as well as per user, and enforce max request body sizes.
- Accessibility pass: labels, dynamic type, contrast, hit sizes.
- Empty, error and slow-network states on every screen.

### Phase 8 — Release
- EAS environments (`development`, `production`) for secrets, `eas.json` profiles, and `eas deploy --prod` for API routes and the share page.
- Inngest prod env and keys, Clerk prod instance (Apple Services ID, Google OAuth clients), Neon prod branch.
- `eas build` → TestFlight / internal testing → `eas submit`.
- Sentry source maps for builds and updates.

---

## 7. Testing and definition of done

- **Unit tests** (Vitest for `server/` and `shared/`, run in Node):
  - Zod schemas accept or reject sample Claude outputs, including truncated ones.
  - Cap logic, including the refund on failure.
  - `requireUser` rejects bad or missing tokens.
  - The ImageKit path-ownership check.
  - Version guard on stale jobs.
  - Share route never leaks user data.
- **Manual QA matrix:** iOS and Android physical devices covering:
  - Sign-in with Google and Apple on both platforms.
  - Generate trips of 1, 7 and 14 days.
  - Leave mid-generation and come back.
  - Airplane mode on a cached trip.
  - Regenerate a day, share link in a browser, avatar and cover upload, delete account.
- **v1 done means:** all phases complete, lint and typecheck clean, unit tests green, the QA matrix passes on both platforms, Sentry receives client and server errors, and generation cost per trip is measured and logged.

---

## 8. Assumptions (no firm answer from the user)

1. Itinerary, hotels and budget are stored as Zod-validated JSONB rather than separate tables.
2. Drizzle ORM.
3. Caps are 5 trips and 20 day regenerations per rolling 24h; failed generations don't count.
4. 1–14 days, 1–10 travelers, budget > 0, ISO currency from a short list.
5. Offline cache uses TanStack Query persistence (storage adapter picked in Phase 4).
6. In-app account deletion is included in v1.
7. The hero image comes from Unsplash by default; a custom cover overrides it.
8. Polling every 2.5s, with a "taking longer" message after 3 minutes.
9. The share page shows no user identity.
10. Environments are dev + prod, with separate Neon branch, Clerk instance and Inngest env each.
11. Uploads are converted on the device to JPEG at 2000px max, 10 MB limit.
12. Avatars are cropped 1:1 and covers 16:9.
13. The server accepts only ImageKit paths inside the requesting user's folder.
14. Account deletion queues deletion of all the user's ImageKit files.
15. Generation is split into a skeleton call plus per-day calls (an architecture choice made to keep Worker requests short and reuse the logic for day regeneration).

## 9. Open risks

1. **EAS Hosting request limits** for long Claude streams inside an Inngest step aren't documented. Phase 0 spike; fallback is a separate Worker or Hono deployment for `/api/inngest`.
2. **Inngest on EAS Hosting:** `inngest/edge` should work, and `async_hooks` is listed as supported. Not yet proven end to end.
3. **Server-side Sentry** on EAS Hosting is unverified.
4. **Unsplash rate limits:** we must apply for production access before launch. The cache table reduces calls, and its terms require hotlinking, attribution and download tracking.
5. **AI accuracy:** places may not exist; the disclaimer mitigates but doesn't eliminate this.
6. **Structured output reliability:** schema validation and retries are in place, and splitting the work per day limits how much one failure costs.
7. **Cost:** the estimate is unverified. Measure in Phase 0, then tune effort, caps and prompt caching.
8. **ImageKit signed-upload details:** the exact current auth scheme, HEIC support and size limits still need confirming from the docs in Phase 6.
9. **Public share page moderation:** custom covers are publicly visible through share links. Tokens can't be guessed and can be revoked; moderation is deferred to v2.
10. **Apple on Android:** uses Clerk's browser SSO flow (no native Apple sheet on Android), so the UX is a browser sheet rather than native.
11. **`web.output: "server"`** plus native-only routes need checking: there must be no accidental public web exposure of `(app)` screens (gate them with `Platform.OS` or a redirect on web).

## 10. v2 candidates (don't paint into a corner)

Push notifications when a trip is ready (`expo-notifications`; generation already ends in one `save` step to hook into). Places verification via Google Places (`Activity` can gain a `placeId`). Billing tiers (caps already live in `limits.ts`). Collaborative trips (`trips.user_id` → membership table). Image moderation. i18n (UI strings centralized; the prompt takes a `locale`).
