#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/workspace/android-sdk}}"
TOOLS="$SDK_ROOT/build-tools/35.0.1"
ANDROID_JAR="$SDK_ROOT/platforms/android-35/android.jar"
VARIANT="${1:-qa}"
VERSION="0.6.5"
BUILD_DIR="$PROJECT_DIR/build/$VARIANT"
DIST_DIR="$PROJECT_DIR/dist"
for required in "$ANDROID_JAR" "$TOOLS/aapt2" "$TOOLS/d8" "$TOOLS/zipalign" "$TOOLS/apksigner"; do
  [[ -f "$required" ]] || { echo "Missing Android dependency: $required" >&2; exit 1; }
done
case "$VARIANT" in
  qa)
    KEYSTORE="$PROJECT_DIR/signing/qa.keystore"
    KEY_ALIAS="androiddebugkey"
    export CT_STORE_PASSWORD=android CT_KEY_PASSWORD=android
    ;;
  live)
    : "${CT_SIGNING_KEYSTORE:?Supply the ORIGINAL live signing keystore}"
    : "${CT_KEY_ALIAS:?Supply signing alias}"
    : "${CT_STORE_PASSWORD:?Supply keystore password privately}"
    : "${CT_KEY_PASSWORD:?Supply key password privately}"
    KEYSTORE="$CT_SIGNING_KEYSTORE"; KEY_ALIAS="$CT_KEY_ALIAS"
    [[ -f "$KEYSTORE" ]] || { echo 'Original live keystore is unavailable.' >&2; exit 1; }
    ;;
  *) echo 'Usage: bash build-apk.sh qa|live' >&2; exit 1;;
esac
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$DIST_DIR" "$PROJECT_DIR/signing"
python3 "$PROJECT_DIR/scripts/prepare_android.py" "$VARIANT" "$BUILD_DIR"
if [[ ! -f "$KEYSTORE" ]]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass:env CT_STORE_PASSWORD -keypass:env CT_KEY_PASSWORD -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Clean Things QA,O=Classroom QA,C=GY' >/dev/null 2>&1
fi
"$TOOLS/aapt2" compile --dir "$BUILD_DIR/res" -o "$BUILD_DIR/resources.zip"
"$TOOLS/aapt2" link -o "$BUILD_DIR/app-unsigned.apk" -I "$ANDROID_JAR" --manifest "$BUILD_DIR/AndroidManifest.xml" --java "$BUILD_DIR/gen" --min-sdk-version 24 --target-sdk-version 35 --version-code 17 --version-name "$VERSION-$VARIANT" -A "$PROJECT_DIR/app/src/main/assets" "$BUILD_DIR/resources.zip"
find "$PROJECT_DIR/app/src/main/java" "$BUILD_DIR/gen" -name '*.java' > "$BUILD_DIR/sources.txt"
java -m jdk.compiler/com.sun.tools.javac.Main -source 8 -target 8 -classpath "$ANDROID_JAR" -d "$BUILD_DIR/classes" @"$BUILD_DIR/sources.txt"
java -m jdk.jartool/sun.tools.jar.Main cf "$BUILD_DIR/classes.jar" -C "$BUILD_DIR/classes" .
"$TOOLS/d8" --min-api 24 --lib "$ANDROID_JAR" --output "$BUILD_DIR/dex" "$BUILD_DIR/classes.jar"
python3 - "$BUILD_DIR" <<'PY'
from pathlib import Path
import sys,zipfile
p=Path(sys.argv[1])
with zipfile.ZipFile(p/'app-unsigned.apk','a') as z:z.write(p/'dex/classes.dex','classes.dex')
PY
"$TOOLS/zipalign" -f 4 "$BUILD_DIR/app-unsigned.apk" "$BUILD_DIR/app-aligned.apk"
OUTPUT="$DIST_DIR/CleanThings-$VARIANT-v$VERSION.apk"
"$TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass env:CT_STORE_PASSWORD --key-pass env:CT_KEY_PASSWORD --out "$OUTPUT" "$BUILD_DIR/app-aligned.apk"
"$TOOLS/apksigner" verify --verbose "$OUTPUT"
echo "Built: $OUTPUT"
