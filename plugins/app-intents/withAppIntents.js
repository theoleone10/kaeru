const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE = 'KaeruIntents.swift';

/**
 * Adds the timer's Shortcuts / Siri actions (KaeruIntents.swift, next to this file) to the iOS
 * app target. App Intents have to live in the app target itself (not a pod) for iOS to find them.
 * AppIntents.framework is weak-linked because it only exists on iOS 16+, and the app supports 15.1.
 */
function withAppIntents(config) {
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
    const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName }).uuid;
    if (!project.hasFile('System/Library/Frameworks/AppIntents.framework')) {
      project.addFramework('AppIntents.framework', { weak: true, target });
    }
    return cfg;
  });
}

module.exports = withAppIntents;
