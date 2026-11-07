# Rally as an app — localhost demo

Capacitor packages a web frontend as a native Android/iOS app. Rally already includes both native projects. Its Node backend runs on your computer; the app connects to it. The native shell does not run Node or replace the shared event database.

## Installable web app

Run `npm install` then `npm run dev` and open http://127.0.0.1:3001. In a supporting desktop browser use **Install Rally** from the browser menu. No Android tools are needed for this option.

Localhost on the computer is a trusted browser context. A phone opening a computer's plain HTTP LAN address is a different situation; use the Android USB method below for the local native demo. Do not expect typing `localhost` on a phone to reach your computer automatically.

The PWA caches its shell and static assets. API responses are never service-worker cached; the app manages its own last-confirmed snapshot and waiting-action queue. Load an event once while connected before trying offline reload. Sync resumes while the app is open; there is no closed-app background job.

## Android on your own computer

Building requires JDK 21 and Android SDK platform 36, build tools 36.0.0 and platform-tools. Android Studio can install the SDK packages. Set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to the SDK folder. The Gradle wrapper downloads its own Gradle distribution on the first build; internet access is needed for native dependencies.

```sh
npm install
npm run app:android
```

The script type-checks, builds the frontend with local API `http://127.0.0.1:3001`, syncs Android, builds a signed debug APK and copies it to:

```text
artifacts/rally-android-debug.apk
```

It then restores the normal browser build. This is a demo/debug artifact, not a store release. Web-only judges do not need any of these tools or downloads.

## Connect an Android phone locally

1. Keep `npm run dev` running on the computer.
2. Enable Developer options and USB debugging on the Android phone. Connect it by USB and accept its debugging prompt.
3. From Android SDK platform-tools, run:

```sh
adb devices
adb reverse tcp:3001 tcp:3001
adb install -r artifacts/rally-android-debug.apk
adb shell am start -n app.rally.eventops/.MainActivity
```

Open Rally and choose **Try a sample event** or sign in. The reverse mapping sends the app's `127.0.0.1:3001` requests to the computer's port 3001, keeping the backend bound locally. Reapply `adb reverse` after reconnecting USB. No deployment is required. With several devices use `adb -s DEVICE_SERIAL` on each command.

If the app cannot connect, check the Node terminal, the cable/debugging permission and `adb reverse --list`. Install alone does not make the server available on a disconnected phone. The bundled frontend can open offline; shared changes wait until its configured backend is reachable again.

To change the API for another local arrangement, set `VITE_API_URL` before `npm run app:android` and configure exact `ALLOWED_ORIGINS`. The default development origins already include Android `https://localhost` and iOS `capacitor://localhost`. The local HTTP build explicitly enables Android cleartext/mixed content. Native sessions use `X-Rally-Client: native`, with a hashed/revocable server token stored on the device through Capacitor Preferences. Preferences is a platform store, not an encrypted secrets vault. No password or integration key is embedded in the APK.

## iOS source

The iOS project is included, but Xcode on macOS is required to compile/run it. No IPA has been built here. It contains the Preferences privacy usage declaration `CA92.1`. Open with `npm run mobile:ios` after building/syncing for the intended API. This localhost Android guide does not imply an iPhone can reach the computer's loopback address without its own connection setup.

## Build and runtime evidence

Android artifact status is recorded in `artifacts/README.md` after compilation. Backend native bearer-session authentication is covered by HTTP tests; the shared UI is covered by browser tests. Neither those tests nor a successful APK build alone proves native runtime behaviour. Physical-device testing, native screen readers, lifecycle recovery and iOS remain separate checks.

References: [Capacitor configuration](https://capacitorjs.com/docs/config), [Preferences](https://capacitorjs.com/docs/apis/preferences), [Android local WebView server access and adb reverse](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server).
