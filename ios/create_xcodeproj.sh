#!/bin/bash
# Creates an Xcode project for Eesha Browser iOS
# Run this on macOS with Xcode installed
#
# Usage: ./create_xcodeproj.sh
#
# This script uses xcodegen (https://github.com/yonaskolb/XcodeGen) to generate
# the Eesha.xcodeproj from project.yml. xcodegen will be installed via Homebrew
# if not already available.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"

echo "=== Eesha Browser iOS - Xcode Project Generator ==="
echo "Project directory: $PROJECT_DIR"

# Verify source files exist
echo ""
echo "Checking source files..."
required_files=(
    "Eesha/AppDelegate.swift"
    "Eesha/BrowserViewController.swift"
    "Eesha/Info.plist"
    "Eesha/Base.lproj/LaunchScreen.storyboard"
    "Eesha/Assets.xcassets/Contents.json"
    "Eesha/Assets.xcassets/AppIcon.appiconset/Contents.json"
)

missing=0
for f in "${required_files[@]}"; do
    if [ ! -f "$PROJECT_DIR/$f" ]; then
        echo "  ❌ Missing: $f"
        missing=1
    else
        echo "  ✅ Found: $f"
    fi
done

if [ $missing -eq 1 ]; then
    echo ""
    echo "ERROR: Some required source files are missing!"
    exit 1
fi

# Check for project.yml
if [ ! -f "$PROJECT_DIR/project.yml" ]; then
    echo ""
    echo "ERROR: project.yml not found in $PROJECT_DIR"
    exit 1
fi
echo "  ✅ Found: project.yml"

# Create entitlements file (needed for App Sandbox / WebKit)
ENTITLEMENTS_DIR="$PROJECT_DIR/Eesha"
if [ ! -f "$ENTITLEMENTS_DIR/Eesha.entitlements" ]; then
    echo ""
    echo "Creating entitlements file..."
    cat > "$ENTITLEMENTS_DIR/Eesha.entitlements" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
PLIST
    echo "  ✅ Created: Eesha/Eesha.entitlements"
else
    echo "  ✅ Found: Eesha/Eesha.entitlements"
fi

# Create build output directory
mkdir -p "$BUILD_DIR"

# Install or verify xcodegen
echo ""
echo "Checking for xcodegen..."
if command -v xcodegen &> /dev/null; then
    XCGEN_VERSION=$(xcodegen --version 2>/dev/null || echo "unknown")
    echo "  ✅ xcodegen found (version: $XCGEN_VERSION)"
else
    echo "  ⚠️  xcodegen not found. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install xcodegen
        echo "  ✅ xcodegen installed successfully"
    else
        echo "  ❌ Homebrew not found! Please install Homebrew first:"
        echo "     /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo ""
        echo "  Then run: brew install xcodegen"
        echo ""
        echo "  Alternatively, install xcodegen via Mint:"
        echo "     mint install yonaskolb/xcodegen"
        exit 1
    fi
fi

# Generate the Xcode project
echo ""
echo "Generating Xcode project from project.yml..."
cd "$PROJECT_DIR"
xcodegen generate

if [ -f "$PROJECT_DIR/Eesha.xcodeproj/project.pbxproj" ]; then
    echo ""
    echo "=== ✅ Xcode project created successfully! ==="
    echo ""
    echo "Project: $PROJECT_DIR/Eesha.xcodeproj"
    echo ""
    echo "To build from command line:"
    echo "  cd $PROJECT_DIR"
    echo "  xcodebuild -project Eesha.xcodeproj -scheme Eesha -sdk iphoneos -configuration Release build CODE_SIGN_IDENTITY=\"-\" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO"
    echo ""
    echo "To build for simulator:"
    echo "  xcodebuild -project Eesha.xcodeproj -scheme Eesha -sdk iphonesimulator -configuration Debug build"
    echo ""
    echo "To open in Xcode:"
    echo "  open $PROJECT_DIR/Eesha.xcodeproj"
else
    echo ""
    echo "=== ❌ Failed to create Xcode project ==="
    echo "Check the output above for errors."
    exit 1
fi
