# Google Play Data Safety Notes

Draft for Bubby internal and closed testing. Confirm final answers in Play Console against the current Google Play Data safety form before submission.

References checked while preparing this draft:

- Google Play Data safety help: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play AI-generated content policy help: https://support.google.com/googleplay/android-developer/answer/14094294
- Android target API requirement: https://developer.android.com/google/play/requirements/target-sdk

## 1. Current Architecture Summary

Bubby is a Vite, React, and TypeScript AI nutrition companion. It stores most user data locally in browser or app localStorage under `bubby:` keys.

Chat requests are sent to `/api/chat`. The API route calls Claude/Anthropic server-side and returns Bubby's reply. Optional image uploads are resized and compressed client-side before they are sent.

AI response reports are sent to `/api/report` with a minimal payload: report reason, latest visible assistant message, timestamp, and route. Reports do not include full chat history, images, profile, weight, macro history, pantry, or memory list.

There is currently no Supabase, account system, billing, ads, analytics SDK, or intentional crash telemetry collection.

## 2. Data Categories Likely Applicable

These are likely categories to review in the Play Console Data safety form. Some local-only fields may not count as collected if they never leave the device, but if they are included in chat context sent to `/api/chat`, treat them as transmitted for AI processing.

### Personal Info

- name or preferred name from onboarding
- age
- height
- current and starting weight
- goal, activity level, and training schedule

### Health And Fitness / Wellness-Related Data

- meals and meal descriptions
- macro totals and targets
- calorie floor and calorie targets
- weight logs or current weight updates
- workout day status and training type
- nutrition preferences, allergies, dietary rules, and established rules
- long-term memory entries related to health, nutrition, goals, schedule, or preferences

### Photos And Images

- optional food images uploaded for AI processing
- local thumbnails or compressed local image copies shown in conversation history

### App Activity

- chat messages
- AI response reports
- recent conversation history included in AI context
- app preferences such as theme, Bubby color, and music setting

### User-Generated Content

- chat text
- report text
- user-provided memory content, rules, pantry items, and food descriptions

### Diagnostics

- Currently, Bubby does not intentionally collect analytics SDK data or crash telemetry.
- Hosting or serverless provider logs may record operational request metadata. Confirm what Vercel or the production host retains before final Play Console answers.

## 3. Data Stored Locally

Local data is stored in localStorage under `bubby:` keys and may include:

- `bubby:user_profile`
- `bubby:daily_log:YYYY-MM-DD`
- `bubby:pantry`
- `bubby:bubby_state`
- `bubby:conversation_history`
- `bubby:onboarding_complete`
- `bubby:memory`
- `bubby:bubby_color`
- theme and music preference keys from the theme/music modules

The in-app clear local data button calls `clearAll()` and removes local `bubby:` keys.

## 4. Data Sent To Server / AI Provider

`/api/chat` receives the user's message, optional compressed image data, and relevant context assembled from localStorage. The server calls Claude/Anthropic.

Context may include:

- user profile
- today's macro totals and remaining macros
- training day context
- pantry
- recent conversation history
- Bubby state
- concern level and weight loss rate signals
- memory entries
- local current time context

Do not state that this data is end-to-end encrypted. Production should use HTTPS.

## 5. Data Sent In Reports

`/api/report` receives only:

- `reason`
- `lastAssistantMessage`
- `timestamp`
- `route`

Reports intentionally do not include full history, images, profile, weight, macro history, pantry, or memory list.

## 6. Data Not Currently Collected

As currently implemented, Bubby does not intentionally collect:

- payment information
- contacts
- precise location
- advertising ID
- account credentials
- account sync data
- billing or subscription data
- analytics SDK events
- crash reporting SDK telemetry

Revisit this list if Supabase, accounts, billing, ads, analytics, crash reporting, or push notifications are added later.

## 7. Sharing / Service Provider Notes

Bubby does not sell user data.

Data may be shared with service providers only to operate app functionality, including:

- Anthropic/Claude for AI processing
- Vercel or another production hosting provider for app/API hosting and logs

Before production, confirm any provider-specific retention or logging settings and reflect them in the privacy policy and Play Console form.

## 8. Deletion Notes

Current deletion path:

- User opens the in-app info panel.
- User selects `clear local data`.
- App asks for confirmation.
- `clearAll()` removes local `bubby:` keys and the app reloads to onboarding.

This deletes local device/browser data controlled by the app. It does not guarantee deletion from Anthropic, hosting logs, or any other service provider systems.

## 9. Open Questions Before Production

- Confirm the privacy policy effective date and support email are current before each release track submission.
- Decide whether AI reports should be stored somewhere durable instead of only logged server-side.
- Confirm production hosting log retention.
- Confirm Anthropic data retention/settings for the production account.
- Decide whether Supabase/accounts will be added later and, if so, add account deletion and sync-data deletion flows.
- Re-check Google Play Data safety answers after any analytics, crash reporting, push notification, billing, ads, or account features are added.
