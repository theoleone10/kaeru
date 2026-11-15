internal import Expo

/// The app's window scene delegate, named in Info.plist's UIApplicationSceneManifest. Expo's base
/// class creates the window, starts React Native in it, and forwards scene events (links, user
/// activities, quick actions, foreground/background) to the app delegate. Apps built with the
/// iOS 27 SDK must use the scene life cycle or iOS stops them at launch.
class SceneDelegate: ExpoAppSceneDelegate {}
