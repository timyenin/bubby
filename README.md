# Bubby

Bubby is an AI-powered nutrition companion designed like a tiny virtual pet. Users chat with Bubby to log meals, track macros, upload food photos, and get gentle context while Bubby reacts through animations, vitals, themes, and little pet-like behaviors.

## Current Status

- Web app deployed on Vercel.
- Android version packaged as a Bubblewrap Trusted Web Activity and available through Google Play internal testing.
- Release phase: tester feedback and bugfix-only polish.
- No billing or subscription flow yet.
- No account sync yet; app state is local-first.

## Tech Stack

- React
- TypeScript
- Vite
- Express for local API development
- Vercel API routes for production
- Claude / Anthropic API
- `localStorage` persistence under `bubby:` keys
- Bubblewrap / Android Trusted Web Activity

## Local Development

```sh
npm install
copy .env.example .env
```

Set `ANTHROPIC_API_KEY` in `.env`, then run:

```sh
npm run dev
```

The Vite app runs at `http://localhost:5173` and proxies `/api` requests to the local Express server on `http://localhost:3001`.

Useful checks:

```sh
npm test
npm run typecheck
npm run build
```

## Privacy And Safety

- Do not commit `.env`.
- Do not commit Android keystores, signing keys, passwords, or signing credentials.
- Do not commit APK/AAB build artifacts.
- The privacy policy is served at `/privacy.html`.
- Bubby is AI-generated and can be wrong.
- Bubby is not medical advice, a doctor, a dietitian, a therapist, or an emergency service.

## Android / TWA

- Android wrapper source/config lives in `android/`.
- Package name: `app.bubby.mobile`.
- TWA packaging notes: `docs/android-twa.md`.
- Signing notes: `docs/android-signing-notes.md`.
- Digital Asset Links file: `public/.well-known/assetlinks.json`.

Keep generated Android build outputs local. The signed AAB/APK and upload keystore are intentionally not tracked.

## Release Docs

- Play Data Safety draft notes: `docs/play-data-safety-notes.md`.
- Release checklist: `docs/release-checklist.md`.
- Tester feedback template: `docs/tester-feedback-template.md`.
