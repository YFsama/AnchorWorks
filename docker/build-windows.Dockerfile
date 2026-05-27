# Anchorworks — cross-compile to Windows from Linux.
#
# Uses `cargo-xwin` to fetch Microsoft's MSVC SDK + CRT headers (with
# auto-accepted EULA, since this is for local dev/CI). Builds the
# `x86_64-pc-windows-msvc` target with clang as the linker, then runs
# Tauri's NSIS bundler (via `makensis`, available cross-platform) to
# produce a self-contained Windows installer + portable .exe.
#
# Notes / caveats:
# - WebView2 runtime is downloaded by the installer at first launch (the
#   user's Win10/11 machine usually already has it). Bundling it inline
#   needs Microsoft's distributable, which we leave as an opt-in toggle.
# - MSI bundling is NOT supported here — it requires WiX on Windows
#   itself. NSIS .exe is the cross-platform target. The release.yml
#   workflow handles MSI via the Windows runner.
#
# Build:
#   docker build -f docker/build-windows.Dockerfile -t anchorworks-builder-win .
# Run (outputs into ./out-win):
#   mkdir -p out-win
#   docker run --rm -v "$PWD":/work -v "$PWD/out-win":/out \
#     -e TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/anchorworks.key)" \
#     -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
#     -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
#     anchorworks-builder-win

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Toolchain prerequisites:
#   - clang + llvm — cargo-xwin's link.exe replacement
#   - lld — fast linker, recommended by cargo-xwin
#   - nsis — produces the .exe installer cross-platform
#   - mingw-w64 — gnu-target alt if cargo-xwin path has issues
#   - libssl-dev, pkg-config, libudev-dev — same as the linux build's
#     transitive deps for host-side cargo metadata resolution
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget file ca-certificates pkg-config \
    clang llvm lld nsis mingw-w64 \
    libssl-dev libudev-dev \
    git \
 && rm -rf /var/lib/apt/lists/*

# Rust + windows-msvc target. The toolchain version is pinned to match
# the Linux builder's Cargo.lock — keeps cross-platform output bit-stable.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.95.0 --profile minimal \
        --target x86_64-pc-windows-msvc
ENV PATH="/root/.cargo/bin:${PATH}"

# cargo-xwin: fetches MSVC SDK + CRT, wires LIB / INCLUDE env vars, then
# delegates the build to the regular cargo. Caches the SDK under
# /root/.cache/cargo-xwin so subsequent builds skip the 500 MB download.
# Pin to 0.x for the stable v0 API (no breaking config-file changes yet).
RUN cargo install cargo-xwin --locked --version 0.18.6

# The MSVC SDK download happens lazily on the first `cargo xwin build`.
# We don't pre-warm it in this RUN — there's no standalone `xwin download`
# subcommand exposed by cargo-xwin; the build step accepts the license
# inline via `XWIN_ACCEPT_LICENSE=1` (set in build-windows.sh).

# Node 20 — same line as the Linux builder for consistent npm behaviour.
RUN apt-get update && apt-get install -y --no-install-recommends \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY docker/build-windows.sh /usr/local/bin/build-windows.sh
RUN chmod +x /usr/local/bin/build-windows.sh

WORKDIR /work
CMD ["/usr/local/bin/build-windows.sh"]
