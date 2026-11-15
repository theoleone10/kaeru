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
# Only the value, e.g. https://abcdefgh.supabase.co: no quotes, spaces or variable name.
case "$EXPO_PUBLIC_SUPABASE_URL" in
  https://*.*) ;;
  *) echo "EXPO_PUBLIC_SUPABASE_URL must be just the URL, like https://abcdefgh.supabase.co (no quotes or name=)" >&2; exit 1 ;;
esac
case "$EXPO_PUBLIC_SUPABASE_URL" in
  *\"*|*\'*|*" "*|*=*) echo "EXPO_PUBLIC_SUPABASE_URL contains quotes, spaces or '=': paste only the URL" >&2; exit 1 ;;
esac
case "$EXPO_PUBLIC_SUPABASE_KEY" in
  *\"*|*\'*|*" "*|EXPO_PUBLIC_*) echo "EXPO_PUBLIC_SUPABASE_KEY contains quotes, spaces or its name: paste only the key" >&2; exit 1 ;;
esac
{
  echo "EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL"
  echo "EXPO_PUBLIC_SUPABASE_KEY=$EXPO_PUBLIC_SUPABASE_KEY"
  echo "EXPO_PUBLIC_SUPPORT_EMAIL=${EXPO_PUBLIC_SUPPORT_EMAIL:-}"
} > .env

# The version (CFBundleShortVersionString) comes from app.json. The build number doesn't: Xcode
# Cloud stamps its own (1, 2, 3, ...) on every build it uploads, whatever the project says. If an
# upload fails with "The bundle version must be higher than the previously uploaded version", raise
# it in App Store Connect: the app, Xcode Cloud, Settings, Build Number, Next Build Number.
if [ -n "${APPLE_TEAM_ID:-}" ]; then
  node -e "
const fs = require('fs');
const a = JSON.parse(fs.readFileSync('app.json'));
a.expo.ios.appleTeamId = process.env.APPLE_TEAM_ID;
fs.writeFileSync('app.json', JSON.stringify(a, null, 2) + '\n');
"
fi
echo "Version $(node -p "require('./app.json').expo.version"), Xcode Cloud build ${CI_BUILD_NUMBER:-?}"

# Prebuild replaces ios/, this folder included: keep a copy and put it back afterwards.
SAVED="$(mktemp -d)"
cp -R ios/ci_scripts "$SAVED/"
echo "Generating the iOS project"
npx expo prebuild --platform ios --clean
rm -rf ios/ci_scripts
cp -R "$SAVED/ci_scripts" ios/
