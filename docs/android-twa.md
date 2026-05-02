# Android TWA Packaging Notes

This project now has a generated Android wrapper under `android/`. These notes document the Bubblewrap / Trusted Web Activity setup and the remaining Play readiness steps.

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

## 5a. Current Wrapper Setup

Generated on Windows with:

- Java: Eclipse Temurin 17.0.18
- Android SDK path: `C:\Users\timye\AppData\Local\Android\Sdk`
- Android command-line tools: 20.0
- Android platform-tools: 37.0.0
- Android platform: `platforms;android-35`
- Android build tools: `35.0.0` and `34.0.0`
- Bubblewrap CLI: 1.24.1
- Android output directory: `android/`
- Package name / applicationId: `app.bubby.mobile`

The wrapper was generated from:

```sh
bubblewrap init --manifest=https://bubby-pearl.vercel.app/manifest.webmanifest --directory=android
```

The interactive Bubblewrap prompt was not used because it was unreliable in the non-interactive shell. The wrapper was generated through Bubblewrap Core using the same manifest-derived settings and the package name above.

Build command used:

```sh
cd android
bubblewrap build --skipSigning
```

Unsigned build outputs generated locally:

- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Aligned unsigned APK: `android/app-release-unsigned-aligned.apk`

These are generated artifacts and must not be committed.

Generated SDK settings:

- `compileSdkVersion 36`
- `targetSdkVersion 35`
- `minSdkVersion 21`

Signed internal-test outputs generated locally:

- Signed AAB: `android/app-release-bundle.aab`
- Signed APK: `android/app-release-signed.apk`

The signed AAB is the file to upload to Play Console internal testing.

Upload keystore location:

```text
C:\Users\timye\Documents\bubby-signing\bubby-upload-key.jks
```

Local upload-key SHA-256 fingerprint:

```text
46:6F:92:9A:E7:A3:A3:70:8D:06:BA:E9:46:E9:42:8D:6E:37:F8:1B:F6:61:73:75:37:7A:BC:BF:58:19:FF:1B
```

This is the LOCAL UPLOAD KEY fingerprint. For the production Trusted Web Activity relationship, create `assetlinks.json` only after Play Console provides the Play App Signing SHA-256 fingerprint.

See `docs/android-signing-notes.md` for the planned Google Play internal-test signing flow. Do not create `assetlinks.json` until the real signing fingerprint is known.

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

Current status: `assetlinks.json` is still pending. Create it only after the real signing certificate SHA-256 fingerprint is known.

## 6a. Next Steps After Signed Build

1. Upload `android/app-release-bundle.aab` to Play Console internal testing.
2. Get the Play App Signing SHA-256 certificate fingerprint from Play Console.
3. Create `public/.well-known/assetlinks.json` only after that real Play fingerprint is known.

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
