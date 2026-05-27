#!/usr/bin/env bash
# Build the Linux native bundle inside the container. Designed to be
# invoked by `docker/build-linux.Dockerfile`'s CMD; runs unattended.
#
# Output: copies the produced .deb / .rpm / .AppImage from
# `src-tauri/target/release/bundle/` to `/out` so the host gets the
# artefacts via the bind-mounted volume.

set -euo pipefail

cd /work

echo "==> Installing JS deps"
# `npm install` (not `npm ci`) for parity with the GitHub Actions
# workflows — see .github/workflows/build.yml for the cross-platform
# optional-dep lockfile gap that makes npm ci unreliable.
npm install --no-audit --no-fund --prefer-offline

echo "==> Building web bundle"
npm run build:web

echo "==> Building native Tauri bundle"
# `--ci` skips interactive bundler prompts (e.g. icon regeneration).
# Updater signing happens automatically when the env vars are present.
npx tauri build --ci

echo "==> Copying artifacts to /out"
mkdir -p /out
find src-tauri/target/release/bundle -type f \
    \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \
       -o -name 'latest.json' -o -name '*.AppImage.sig' \
       -o -name '*.deb.sig' -o -name '*.rpm.sig' \) \
    -exec cp -v {} /out/ \;

echo "==> Generating latest.json (updater manifest)"
# The in-app updater plugin polls the endpoint configured in
# tauri.conf.json#plugins.updater.endpoints for a JSON manifest with
# per-platform { signature, url } pairs. Linux only ships AppImage for
# updates (.deb / .rpm are install-once); the URL is a placeholder that
# the release workflow rewrites to the GitHub Releases asset URL.
APPIMAGE="$(ls /out/*.AppImage 2>/dev/null | head -1)"
APPIMAGE_SIG="$(ls /out/*.AppImage.sig 2>/dev/null | head -1)"
VERSION=$(node -p "require('/work/package.json').version")
if [ -n "$APPIMAGE_SIG" ]; then
  BASENAME=$(basename "$APPIMAGE")
  PUBDATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  # node-driven JSON build keeps the multi-line signature properly escaped
  # without shelling out to python (which the runtime image doesn't ship).
  node -e "
    const fs = require('fs');
    const sig = fs.readFileSync('${APPIMAGE_SIG}', 'utf8');
    const out = {
      version: '${VERSION}',
      notes: 'Anchorworks ${VERSION}',
      pub_date: '${PUBDATE}',
      platforms: {
        'linux-x86_64': {
          signature: sig,
          url: 'https://github.com/YFsama/AnchorWorks/releases/download/v${VERSION}/${BASENAME}',
        },
      },
    };
    fs.writeFileSync('/out/latest.json', JSON.stringify(out, null, 2));
  "
  echo "    wrote /out/latest.json"
fi

echo "==> Done"
ls -la /out

# Re-own the output to the host's UID so the user can `rm`/`chmod`/etc.
# without sudo. HOST_UID/HOST_GID are passed in by the docker run wrapper.
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  echo "==> Reassigning /out ownership to ${HOST_UID}:${HOST_GID}"
  chown -R "${HOST_UID}:${HOST_GID}" /out
fi
