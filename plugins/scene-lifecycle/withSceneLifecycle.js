const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const FILE = 'SceneDelegate.swift';

/**
 * Moves the iOS app onto the UIScene life cycle. Apps built with the iOS 27 SDK that don't adopt it
 * are stopped at launch (UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo ships
 * the scene delegate (ExpoAppSceneDelegate) but its app template doesn't use it yet, so this:
 *
 * 1. declares one window scene in Info.plist, handled by SceneDelegate;
 * 2. adds SceneDelegate.swift (next to this file) to the app target;
 * 3. makes AppDelegate an ExpoReactNativeFactoryProvider and stops it creating its own window:
 *    the scene delegate creates the window and starts React Native in it.
 *
 * Fails the prebuild if AppDelegate.swift no longer looks the way this expects, rather than
 * shipping an app that starts React Native twice or not at all.
 */
function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    let src = cfg.modResults.contents;

    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      const decl = /class AppDelegate: ExpoAppDelegate \{/;
      if (!decl.test(src)) throw new Error('withSceneLifecycle: AppDelegate declaration not found');
      src = src.replace(decl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }

    const start = /\n[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[ \t]*factory\.startReactNative\([\s\S]*?\)\n[ \t]*#endif\n/;
    if (start.test(src)) {
      src = src.replace(start, '\n    // The window and React Native start in SceneDelegate (scene life cycle).\n');
    } else if (!src.includes('(scene life cycle)')) {
      throw new Error('withSceneLifecycle: the window/startReactNative block in AppDelegate.swift was not found');
    }

    cfg.modResults.contents = src;
    return cfg;
  });

  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      fs.copyFileSync(path.join(__dirname, FILE), path.join(cfg.modRequest.platformProjectRoot, projectName, FILE));
      return cfg;
    },
  ]);

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${projectName}/${FILE}`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project });
    }
    return cfg;
  });
}

module.exports = withSceneLifecycle;
