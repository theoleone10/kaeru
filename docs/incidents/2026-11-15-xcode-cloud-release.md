# 2026-11-15: First Xcode Cloud release couldn't upload, then crashed on launch

**Status:** fixes merged; awaiting the first TestFlight build with the launch fix
**Affected:** iOS 1.1.0 TestFlight builds from Xcode Cloud. No App Store users: nothing went to review.

## Summary

Moving iOS releases to Xcode Cloud (merge `dev` → `master`) hit two problems in a row:

1. **Uploads were rejected.** Every build archived fine but failed to upload with *"The bundle version must be higher than the previously uploaded version."*
2. **Once uploads worked, the app crashed on open** on iOS 27 (TestFlight build 1.1.0 (9), iPhone OS 27.2.1).

Neither came from app code. Both came from the release pipeline changing from EAS / GitHub Actions to Xcode Cloud.

## Timeline

- **2026-11-12:** iOS releases switched from GitHub Actions to Xcode Cloud (`2d9f39f`). `ios/ci_scripts/ci_post_clone.sh` generates the native project with `expo prebuild` and set the build number to `1000 + CI_BUILD_NUMBER`.
- **2026-11-15:** Merges to `master` start Xcode Cloud builds. The archives succeed, but every upload is rejected (problem 1).
- **2026-11-15:** The cause is found. Next Build Number is raised in App Store Connect, and the script's build-number step is removed (#25). Uploads succeed.
- **2026-11-15:** TestFlight build 1.1.0 (9) crashes the moment it opens. The crash report points at the scene life cycle (problem 2). Fix: `plugins/scene-lifecycle/`.

## Problem 1: build number rejected

**Cause.** Xcode Cloud ignores the build number in the project and stamps its own on every build it distributes. That counter starts at 1 and goes up by one per build ([Apple: Setting the next build number for Xcode Cloud builds](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds)). Version 1.1.0 already had builds numbered 1000 and up, uploaded by EAS and by the GitHub Actions workflow. Xcode Cloud's 1, 2, 3… were lower, so App Store Connect rejected them. The script's `1000 + CI_BUILD_NUMBER` never reached App Store Connect.

**Fix.**
- In App Store Connect → Kaeru → Xcode Cloud → Settings → Build Number, **Next Build Number** was set above the highest existing build. This is a one-time setting; no code can change it.
- The build-number step was removed from `ci_post_clone.sh`. The script and the README now explain the setting (`843d8cc`, PR #25).

## Problem 2: crash on launch

**Symptom.** The app closed immediately on open. From the crash report:

```
Exception Type:  EXC_BREAKPOINT (SIGTRAP)
Thread 0 Crashed (main thread):
  __UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke
  -[UIApplication workspace:didCreateScene:withTransitionContext:completion:]
  ...
  UIApplicationMain
DTAppStoreToolsBuild: 27B52   OS: iPhone OS 27.2.1
```

**Cause.** Apps built with the iOS 27 SDK must use the UIScene life cycle (a scene delegate that owns the window). Otherwise UIKit stops them at launch. Xcode Cloud builds with the latest Xcode, so this was the first Kaeru build made with the iOS 27 SDK. Earlier EAS builds used an older Xcode and launched normally.

Expo SDK 57 ships the pieces needed: `ExpoAppSceneDelegate`, documented in its source as "Required by the iOS 27, which asserts at launch unless the app adopts the scene-based life cycle", and `ExpoReactNativeFactoryProvider`. But its app template, which `expo prebuild` copies, still creates the window in `AppDelegate` and declares no scene. This was true even of the newest 57.x release on 2026-11-15 (57.0.33). So every prebuilt app on SDK 57 crashes this way once it's built with the iOS 27 SDK.

**Fix.** The config plugin `plugins/scene-lifecycle/withSceneLifecycle.js`, listed in `app.json`, makes three changes during prebuild:

1. Info.plist gets a `UIApplicationSceneManifest` with one window scene, handled by `$(PRODUCT_MODULE_NAME).SceneDelegate`.
2. `SceneDelegate.swift` (`class SceneDelegate: ExpoAppSceneDelegate {}`) is copied into the app target. Expo's base class creates the window, starts React Native in it, and forwards scene events to `AppDelegate`: links, user activities, quick actions and foreground/background.
3. `AppDelegate.swift` is made to conform to `ExpoReactNativeFactoryProvider`, and the block that created a `UIWindow` and called `startReactNative` is removed, so React Native starts exactly once, from the scene delegate.

If `AppDelegate.swift` from a future Expo template no longer matches what the plugin expects, prebuild fails with an error. A broken app never ships silently.

**Fallback.** Apps built with the iOS 26 SDK still launch on iOS 27. If a build is needed before a fix lands, set the Xcode Cloud workflow's Environment → Xcode version to the latest 26.x. The scene setup works with either SDK.

## Verification

- Ran `expo prebuild --platform ios` on a copy of the project and checked the generated `AppDelegate.swift`, `SceneDelegate.swift`, `Info.plist` and `project.pbxproj`.
- `tsc` and `expo lint` pass.
- **Still to confirm** on the next TestFlight build:
  - the app opens on iOS 27;
  - a `kaeru://` link works, both when it cold-starts the app and while the app is running;
  - Sign in with Apple and Google sign-in work;
  - Shortcuts timer actions work.

## Follow-ups

- When Expo's template adopts the scene life cycle itself, delete `plugins/scene-lifecycle/` and its `app.json` entry. The plugin then fails prebuild, because the window block it removes is gone, which is the signal.
- Before switching the build machine or Xcode version, check the new SDK's launch requirements. Both problems here were new behaviour from a toolchain change.
