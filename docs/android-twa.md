# Android TWA Packaging Notes

This project is not generating the Android wrapper yet. These notes prepare Bubby for a Bubblewrap / Trusted Web Activity setup later.

## 1. What A TWA Is For Bubby

A Trusted Web Activity packages the production Bubby web app as an Android app while keeping the actual app served from the production web origin. For Bubby, the Android app should open the deployed Vite app fullscreen/standalone and rely on the web manifest, production HTTPS origin, and Digital Asset Links relationship between the website and Android package.

## 2. Production URLs

- Production URL: https://bubby-pearl.vercel.app
- Manifest URL: https://bubby-pearl.vercel.app/manifest.webmanifest
- Privacy policy URL: https://bubby-pearl.vercel.app/privacy.html

## 3. Prerequisites

- Node/npm
- Bubblewrap CLI
- Android Studio / Android SDK
- Java/JDK if Bubblewrap or Gradle requires it on the local machine
- Access to the production deployment and DNS/origin
- A safe place to store release signing keys and passwords outside the repo

## 4. Recommended Package Name

Use:

```text
app.bubby.mobile
```

Keep this stable once published. Changing package names later effectively creates a different Android app.

## 5. Bubblewrap Commands

Install Bubblewrap CLI:

```sh
npm install -g @bubblewrap/cli
```

Initialize from the deployed manifest URL:

```sh
bubblewrap init --manifest https://bubby-pearl.vercel.app/manifest.webmanifest
```

Build the Android project:

```sh
bubblewrap build
```

Install and test on a connected Android device:

```sh
bubblewrap install
```

Do not run these commands until the production manifest, icons, privacy policy, and package-name decision are ready.

## 6. Digital Asset Links

TWA fullscreen trust requires a valid Digital Asset Links file served from:

```text
public/.well-known/assetlinks.json
```

That file must include the real Android package name and the real SHA-256 signing certificate fingerprint. Do not create `assetlinks.json` with placeholder or fake values.

You will need:

- package name, recommended as `app.bubby.mobile`
- SHA-256 signing certificate fingerprint for the signing key
- separate awareness of debug vs release fingerprints

Debug builds and release builds use different signing certificates. If you test with debug signing, the debug fingerprint must be represented for that environment. For Play release builds, use the release/app-signing fingerprint required by the final distribution path.

## 7. Signing Key Safety

- Never commit `.jks`, `.keystore`, `.p12`, `.pem`, `.key`, passwords, or signing credentials.
- Save the release keystore somewhere durable and private.
- Store passwords outside the repo.
- Back up the release signing material carefully; losing it can block future updates depending on the signing setup.

## 8. Google Play Target API

New Google Play app submissions and app updates need Android 15 / API 35+ unless Google's requirements change.

After Bubblewrap generates the Android project, verify `targetSdkVersion` or the Gradle target SDK value in the generated Android project before uploading to Play Console.

## 9. Internal Test Then Closed Test

- Run internal testing first.
- Move to closed testing after internal testing is stable.
- If the personal account requirement applies, plan for 12 testers over 14 continuous days.
- During testing, keep changes bugfix-only unless a compliance or safety issue blocks release.

## 10. Known Phase A Limitations

- Data is localStorage-only.
- There is no account sync.
- There is no billing.
- Reports currently log server-side.
- Supabase, account deletion, durable report storage, billing, and subscription features are later phases.
