#!/bin/bash
# Builds the fixture app for the iOS Simulator without an Xcode project:
# a single Swift file compiled with swiftc and wrapped in an .app bundle.
#
# Usage: build.sh [output directory]   (default: build/)
# Prints the path of the resulting .app on the last line.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/build}"
app="$out/Fixture.app"
arch="$(uname -m)"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"

rm -rf "$app"
mkdir -p "$app"

xcrun --sdk iphonesimulator swiftc \
  -target "${arch}-apple-ios17.0-simulator" \
  -sdk "$sdk" \
  -parse-as-library \
  -O \
  "$here/App.swift" \
  -o "$app/Fixture"

cp "$here/Info.plist" "$app/Info.plist"
# Simulator apps need a signature, but an ad-hoc one is enough.
codesign --force --sign - "$app"

echo "$app"
