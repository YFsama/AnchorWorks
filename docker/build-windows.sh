#!/usr/bin/env bash
# Cross-compile Anchorworks to Windows (x86_64-pc-windows-msvc) inside
# the Docker builder. Output: a signed NSIS installer + portable .exe.

set -euo pipefail

cd /work

echo "==> Installing JS deps"
npm ci --no-audit --no-fund --legacy-peer-deps

echo "==> Building web bundle"
npm run build:web

echo "==> Cross-compiling Tauri to x86_64-pc-windows-msvc"
# `tauri build --target x86_64-pc-windows-msvc --runner cargo-xwin`:
#   --runner replaces the default `cargo` invocation with `cargo-xwin`
#   so the MSVC SDK + CRT env vars (LIB / INCLUDE / etc.) get injected
#   automatically. `--bundles nsis` skips MSI (which needs WiX on
#   Windows itself).
# `XWIN_ACCEPT_LICENSE=1` accepts the Microsoft Software Distribution
# license that xwin's `download` step prompts for on first run. Setting
# the env var is equivalent to the interactive `y` answer.
export XWIN_ACCEPT_LICENSE=1
npx tauri build \
    --target x86_64-pc-windows-msvc \
    --runner cargo-xwin \
    --bundles nsis \
    --ci

echo "==> Copying artifacts to /out"
mkdir -p /out
BUNDLE_DIR=src-tauri/target/x86_64-pc-windows-msvc/release/bundle
find "$BUNDLE_DIR" -type f \
    \( -name '*.exe' -o -name '*.exe.sig' -o -name '*.msi' -o -name '*.msi.sig' \) \
    -exec cp -v {} /out/ \;
# Also copy the raw stripped binary so power users have something
# portable to ship outside of an installer.
cp -v src-tauri/target/x86_64-pc-windows-msvc/release/anchorworks.exe /out/ 2>/dev/null || true

# Updater manifest (Windows side) — same shape as the Linux builder's
# latest.json. Generated only when the NSIS bundle's .sig is present.
NSIS_EXE="$(ls /out/*-setup.exe 2>/dev/null | head -1 || true)"
NSIS_SIG="$(ls /out/*-setup.exe.sig 2>/dev/null | head -1 || true)"
VERSION=$(node -p "require('/work/package.json').version")
if [ -n "$NSIS_SIG" ] && [ -n "$NSIS_EXE" ]; then
  BASENAME=$(basename "$NSIS_EXE")
  PUBDATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  node -e "
    const fs = require('fs');
    const sig = fs.readFileSync('${NSIS_SIG}', 'utf8');
    const out = {
      version: '${VERSION}',
      notes: 'Anchorworks ${VERSION}',
      pub_date: '${PUBDATE}',
      platforms: {
        'windows-x86_64': {
          signature: sig,
          url: 'https://github.com/YFsama/AnchorWorks/releases/download/v${VERSION}/${BASENAME}',
        },
      },
    };
    fs.writeFileSync('/out/latest-windows.json', JSON.stringify(out, null, 2));
  "
  echo "    wrote /out/latest-windows.json"
fi

echo "==> Done"
ls -la /out

if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  echo "==> Reassigning /out ownership to ${HOST_UID}:${HOST_GID}"
  chown -R "${HOST_UID}:${HOST_GID}" /out
fi
