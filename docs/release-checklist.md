# Bubby Release Checklist

Working checklist for Google Play internal and closed testing.

## Privacy And Safety

- Publish `public/privacy.html` at a stable production URL.
- Replace privacy policy placeholders: `[DATE]` and `[YOUR SUPPORT EMAIL]`.
- Confirm the in-app hamburger menu links to `/privacy.html`.
- Confirm the in-app AI response report flow submits to `/api/report`.
- Confirm reports send only reason, latest visible Bubby message, timestamp, and route.
- Confirm the in-app `clear local data` flow asks for confirmation and resets local `bubby:` storage.
- Re-check AI/nutrition disclaimers in the app and privacy policy.

## Google Play Console

- Complete the Data Safety form using `docs/play-data-safety-notes.md` as a draft.
- Complete content rating.
- Review Google Play AI-generated content policy requirements.
- Confirm whether an in-app reporting mechanism is required for the current release category and that Bubby's report flow satisfies the internal testing plan.
- Prepare store listing copy that does not claim medical advice, clinical care, HIPAA compliance, or guaranteed nutrition accuracy.

## Android / TWA / PWA Packaging

- Confirm the production privacy policy URL is reachable without login.
- Confirm the TWA/PWA manifest is complete for the Android wrapper.
- Confirm app icons and splash assets are final enough for testing.
- Confirm Android target API 35 or higher for new app submission, unless Google Play requirements change.
- Confirm production uses HTTPS.

## Testing Tracks

- Run local validation before each release candidate:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
- Deploy production or preview build and smoke test:
  - onboarding
  - normal chat
  - image upload
  - report form
  - clear local data
  - privacy policy link
- Run internal test first.
- Move to closed test only after internal test is stable.
- If the personal-account 12 testers / 14 days requirement applies, keep the closed test focused on stability and feedback.

## Closed Test Rules

- Treat tester feedback as bugfix-only unless a release blocker requires a small compliance or safety change.
- Do not add new cute features during the testing window.
- Track every tester issue with reproduction steps, device/browser details, and build version.
- Re-run validation after each bugfix.
- Keep privacy policy and Data Safety answers aligned with the actual shipped build.
