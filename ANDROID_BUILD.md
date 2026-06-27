# Android APK Build Notes

The Android project is generated with Capacitor and uses the static Next.js export from `out`.

## Prerequisites

- `.env.local` must contain the real pilot or production Supabase values before building an APK for store use.
- JDK 21 is required for the current Capacitor Android toolchain.
- Android SDK path on this machine is configured in `android/local.properties`.

## Debug APKs

```powershell
npm run build
npx cap sync android
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
cd android
.\gradlew.bat assemblePosDebug assembleAdminDebug
```

Outputs:

```text
android/app/build/outputs/apk/pos/debug/app-pos-debug.apk
android/app/build/outputs/apk/admin/debug/app-admin-debug.apk
dist-apk/Mhenching-POS-latest-debug.apk
dist-apk/Mhenching-Admin-latest-debug.apk
```

- **Mhenching POS** uses package id `com.mhenching.pos` and opens the attendant POS.
- **Mhenching Admin** uses package id `com.mhenching.admin` and opens the Admin Dashboard. From there, management can open Mobile Admin Capture for adding products by barcode/photo or jump to POS when needed.
- The current branded launcher icon is packaged into both APKs. A 512px Play Store draft icon is generated at `dist-apk/Mhenching-App-Icon-512.png`.

## Current Status

Separate POS/Admin debug APK builds have been verified locally. This machine has a `.env.local`, but verify it points to the intended pilot or production Supabase project before rebuilding and installing on store phones.
