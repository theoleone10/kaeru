#!/bin/sh
# Xcode Cloud runs this right after cloning, before it builds ios/Kaeru.xcworkspace.
# Kaeru doesn't commit its native project (Expo Continuous Native Generation), so this
# generates it: Node and CocoaPods, npm ci, then `expo prebuild`.
#
# Set these as environment variables on the Xcode Cloud workflow (Environment → Environment
# Variables; mark the key as secret):
#   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY, EXPO_PUBLIC_SUPPORT_EMAIL
#     the app reads these at build time; without them sign-in and sync silently don't work.
#   APPLE_TEAM_ID (optional)
#     your 10-character team id, if Xcode Cloud reports that no team is set for signing.
set -eu

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO"

echo "Installing Node and CocoaPods"
export HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_AUTO_UPDATE=1
brew install node cocoapods

echo "Installing JavaScript dependencies"
npm ci

echo "Writing app settings (.env)"
: "${EXPO_PUBLIC_SUPABASE_URL:?Set EXPO_PUBLIC_SUPABASE_URL on the Xcode Cloud workflow}"
: "${EXPO_PUBLIC_SUPABASE_KEY:?Set EXPO_PUBLIC_SUPABASE_KEY on the Xcode Cloud workflow}"
{
  echo "EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL"
  echo "EXPO_PUBLIC_SUPABASE_KEY=$EXPO_PUBLIC_SUPABASE_KEY"
  echo "EXPO_PUBLIC_SUPPORT_EMAIL=${EXPO_PUBLIC_SUPPORT_EMAIL:-}"
} > .env

# Every upload needs a new build number; 1000+ keeps it above builds uploaded earlier by EAS or
# by hand from Xcode. The version (CFBundleShortVersionString) comes from app.json.
BUILD=$((1000 + ${CI_BUILD_NUMBER:-0}))
node -e "
const fs = require('fs');
const a = JSON.parse(fs.readFileSync('app.json'));
a.expo.ios.buildNumber = '$BUILD';
if (process.env.APPLE_TEAM_ID) a.expo.ios.appleTeamId = process.env.APPLE_TEAM_ID;
fs.writeFileSync('app.json', JSON.stringify(a, null, 2) + '\n');
"
echo "Version $(node -p "require('./app.json').expo.version"), build $BUILD"

# Prebuild replaces ios/, this folder included: keep a copy and put it back afterwards.
SAVED="$(mktemp -d)"
cp -R ios/ci_scripts "$SAVED/"
echo "Generating the iOS project"
npx expo prebuild --platform ios --clean
rm -rf ios/ci_scripts
cp -R "$SAVED/ci_scripts" ios/
