# AGENTS.md — MyTrip

Instructions for every AI coding agent working in this repository. Follow them exactly.

## ⚠️ Important Rule: Never Run the Application

You must **never** start, run, or launch the application yourself. The developer is already running it in a separate terminal.

- Do **not** run `npx expo start`, `npm start`, `npm run android|ios|web`, `npx expo run:android|ios`, or anything else that starts the dev server or launches the app.
- Do **not** stop, restart, or kill the developer's running processes (Metro, emulators, simulators).
- Your job is to implement and modify code as instructed without interfering with the running process. Metro picks up your file changes automatically.
- Verification you **may** run: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, unit tests.

---

## Project

**MyTrip** is an AI trip planner for iOS and Android. A signed-in user enters a destination, start date, trip length, number of travelers, traveler type, budget, interests and pace. The trip is generated in the background, and the result is a day-by-day itinerary, a budget breakdown, place suggestions and hotel suggestions.

- Scope and design: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) covers the data model, API, generation pipeline, assumptions and risks.
- Task list: [`PLAN.md`](PLAN.md). When you finish a feature, tick its item (`- [ ]` → `- [x]`). Never tick something that isn't fully done.
- Visual references: `design/` (`design-system.png`, `auth-ui-design.png`, …). Match them when building screens.

## Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| App framework | **Expo SDK 57** (React Native 0.86, React 19.2) | Continuous Native Generation; development builds via `expo-dev-client` |
| Language | **TypeScript** (strict) | |
| Navigation | **Expo Router** + **native tabs** | See *Navigation* below |
| Styling | **NativeWind v4** (Tailwind CSS 3) | Tokens in `tailwind.config.js` |
| Font | **Inter** (`@expo-google-fonts/inter`) | |
| Backend | **Expo Router API routes** (`+api.ts`) on **EAS Hosting** | Cloudflare Workers runtime, not full Node |
| Database | **PostgreSQL** hosted on **Neon** | `@neondatabase/serverless` HTTP driver |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit` | |
| Authentication | **Clerk** (`@clerk/expo`, `@clerk/backend`) | Google (browser SSO) + Apple (native on iOS, browser SSO elsewhere); no email/password in v1 |
| Background jobs | **Inngest** | Served from `/api/inngest` |
| AI | **Anthropic Claude Sonnet 5.5** (`@anthropic-ai/sdk`) | Server-side only |
| Image optimization | **ImageKit** | User uploads (avatars, trip covers) and their transformations |
| Place photos | **Unsplash API** | Hotlinked with photographer attribution |
| Error tracking / monitoring | **Sentry** (`@sentry/react-native`) | |
| Client data | **TanStack Query** | Polling and offline cache |
| Validation | **Zod** | Shared schemas for client and server |

Don't add, replace or remove any of these technologies without the developer's approval.

## Expo Has Changed — Don't Trust Your Training Data

Expo ships breaking changes in every SDK release, so APIs you remember may be renamed, moved or removed. Before writing code that touches an Expo, EAS or React Native API:

1. Check the `expo` major version in `package.json`. It is currently **57**.
2. Read the matching versioned docs at `https://docs.expo.dev/versions/v57.0.0/`.
3. For anything else, start from https://docs.expo.dev/llms.txt, which indexes all Expo docs and corrects common LLM mistakes. Never answer from memory.

The same goes for Clerk, Inngest, Drizzle, ImageKit, Sentry and the Anthropic SDK: check current docs, and use the Clerk skills in `.claude/skills/` where they apply.

## Navigation

- Use **Expo Router** for all navigation. Routes live in `src/app/`: every file there is a screen, and `_layout.tsx` files define navigators. Keep everything else (components, hooks, utils, server code) **outside** `src/app/`.
- Import `Link`, `router`, `Redirect` and `useLocalSearchParams` from `expo-router`.
- **Always use native tabs. Never use JavaScript-based tabs.**
  - Use `NativeTabs` from **`expo-router/unstable-native-tabs`**, which is the correct path for SDK 55–57. It becomes `expo-router/native-tabs` on SDK 58+, so update the import when the project upgrades.
  - Do **not** use Expo Router's JS `<Tabs>` (`expo-router` `Tabs`), `@react-navigation/bottom-tabs`, `@react-navigation/material-top-tabs`, or any custom JS tab bar.
  - Shape: `<NativeTabs>` → `<NativeTabs.Trigger name="…">` containing `<NativeTabs.Trigger.Label>` and `<NativeTabs.Trigger.Icon sf="…" md="…" />`. That's an SF Symbol for iOS and a Material Symbol for Android.
  - Limits: at most **5 tabs** (Android), no native tabs nested inside native tabs, and no adding or removing tabs at runtime.
  - Put stacks inside tabs with a `_layout.tsx` that renders `<Stack />` in each tab folder.
- Use protected routes driven by Clerk's `isSignedIn` for signed-in and signed-out areas.
- Docs: https://docs.expo.dev/router/introduction.md · https://docs.expo.dev/router/advanced/native-tabs.md

## Architecture

```
src/
  app/            # routes only (screens, layouts, +api.ts API routes)
  server/         # server-only code: db, auth, ai, inngest, imagekit, unsplash, limits
  shared/         # Zod schemas + types used by both client and server
  features/       # feature-scoped components and hooks (auth, trips, profile, …)
  components/     # shared UI components (icons in components/icons)
  lib/            # client utilities: API client, query keys, formatters
drizzle/          # generated migrations
```

- **Client vs server:** the app talks only to our own `/api/*` routes. Secrets, Drizzle, Claude, Inngest, the ImageKit private key and Unsplash calls live only in `src/server/` and API routes. Never import `src/server/*` from screens or components.
- **API routes:** every route except `/api/share/*` and `/api/inngest` must verify the Clerk session (`requireUser`). Validate all input with Zod. Return errors as `{ error: { code, message } }`.
- **Workers runtime:** API routes run on Cloudflare Workers. Use only Workers-compatible packages and APIs: `fetch`, Web Crypto, the Neon HTTP driver. No native Node addons, `fs` or long-lived sockets.
- **Database:**
  - Define the Drizzle schema in TypeScript; it is the source of truth.
  - Change it only through `drizzle-kit` migrations, using `DATABASE_URL_UNPOOLED` for migrations.
  - Never edit applied migrations.
  - Use Neon's `dev` branch for development and `main` for production.
- **Background jobs:**
  - Long or retryable work (AI generation, image cleanup) runs in Inngest functions with `step.run`.
  - Functions must be idempotent: the event `id` is the generation ID, and writes are guarded by `generation_version`.
  - Every function needs an `onFailure` handler that leaves data consistent and refunds the user's daily generation.
- **AI:**
  - Use `claude-sonnet-5-5` with structured output validated by the Zod schemas in `src/shared/`.
  - Stream long responses, check `stop_reason`, and record token usage.
- **Images:**
  - User uploads go **directly from the device to ImageKit** using signed parameters from `/api/uploads/auth`.
  - Store ImageKit `filePath` and `fileId`, not full URLs, and build display URLs with transforms.
  - Unsplash photos are shown from their own URLs with attribution and are never proxied.
- **Client state:**
  - TanStack Query for server state, with a persisted cache so viewed trips work offline.
  - Poll trip status while it is `pending` or `generating`; there are no push notifications in v1.
- **Errors and monitoring:**
  - Report unexpected errors to Sentry and never swallow errors silently.
  - Don't send secrets or trip contents to Sentry.

## UI Conventions

- Style with NativeWind `className`, using tokens from `tailwind.config.js` (`text-ink`, `text-muted`, `text-link`, `bg-surface`, `border-stroke`, `primary`). Add new tokens to the config instead of hard-coding colors in components.
- Fonts: `font-inter`, `font-inter-medium`, `font-inter-semibold`, `font-inter-bold`, `font-inter-extrabold`. Custom fonts don't respond to `fontWeight`, so pick the family instead.
- Use `style` only for values NativeWind can't express, such as computed sizes or `boxShadow`.
- Images: `expo-image`. Icons: SVG components in `src/components/icons/` (`react-native-svg`).
- Mobile-first: respect safe areas (`react-native-safe-area-context`), support dynamic type, keep touch targets at least 44pt, and add `accessibilityRole` and `accessibilityLabel` to interactive elements.
- Every screen needs loading, empty and error states.
- Platform rules: Sign in with Apple uses the native sheet on iOS and Clerk's browser SSO flow (`oauth_apple`) on Android and web; Google uses browser SSO (`oauth_google`) everywhere. Signed-in app screens aren't available on web; the only public web page is `/share/[token]`.

## Code Conventions

- TypeScript strict; no `any` without a comment explaining why. Use the `@/` path alias for imports from `src/`.
- File names: `kebab-case.tsx`. Components: `PascalCase`. Hooks: `useCamelCase`.
- Match the surrounding code's style and comment density. Keep functions small and colocate feature code.
- Never commit secrets. `EXPO_PUBLIC_*` variables are bundled into the app and must never hold secrets. Variables are documented in `.env`, and dev and prod values live in EAS environment variables.

## Commands

npm is the package manager (`package-lock.json`).

```bash
npx expo install <package>   # ALWAYS use instead of npm install — resolves SDK-compatible versions
npx expo install --fix       # fix incompatible package versions
npx expo lint                # lint
npx tsc --noEmit             # typecheck
npx expo-doctor              # diagnose dependency and config issues
```

Run lint and typecheck before declaring any task done. **Don't start the app** (see the rule at the top).

## Building and Releasing with EAS

- Use EAS for builds, signing and submission (`npx eas-cli@latest build`, `submit`), for over-the-air updates (`eas update`), and for hosting API routes and the share page (`eas deploy`).
- Only run build or deploy commands when the developer explicitly asks.
- Docs: https://docs.expo.dev/eas/index.md

## Native Code Rules

- `ios/` and `android/` are generated (Continuous Native Generation) and gitignored. Never create or edit them by hand; configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. This project uses native libraries (Clerk native sign-in, Sentry, `react-native-svg`, `expo-dev-client`), so it runs in a **development build**. After you add a native dependency, tell the developer a rebuild is needed instead of running it yourself.
- Prefer Expo modules over third-party libraries, and check the available skills before adding dependencies.
