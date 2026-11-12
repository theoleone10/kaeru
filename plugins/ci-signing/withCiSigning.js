const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

/**
 * Release signing for the GitHub Actions build (.github/workflows/ios-release.yml).
 *
 * Does nothing unless IOS_SIGNING_PROFILE is set, so local builds and Xcode keep their normal
 * automatic signing. In CI it switches only the app target (not the CocoaPods targets, which
 * must stay unsigned) to manual signing with the App Store distribution certificate and the
 * provisioning profile the workflow installed.
 *
 *   IOS_SIGNING_PROFILE  name of the App Store provisioning profile
 *   APPLE_TEAM_ID        the 10-character team id
 */
function withCiSigning(config) {
  const profile = process.env.IOS_SIGNING_PROFILE;
  const team = process.env.APPLE_TEAM_ID;
  if (!profile || !team) return config;

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const { target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
    const configs = project.pbxXCBuildConfigurationSection();
    for (const { value } of list.buildConfigurations) {
      const settings = configs[value].buildSettings;
      settings.CODE_SIGN_STYLE = 'Manual';
      settings.DEVELOPMENT_TEAM = team;
      settings.CODE_SIGN_IDENTITY = '"Apple Distribution"';
      settings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'] = '"Apple Distribution"';
      settings.PROVISIONING_PROFILE_SPECIFIER = `"${profile}"`;
    }
    return cfg;
  });
}

module.exports = withCiSigning;
