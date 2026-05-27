# Anchorworks — reproducible Linux bundle builder.
#
# Compiles the Tauri shell against Ubuntu 22.04's WebKitGTK 4.1 + GTK3 +
# AppIndicator stack — the same baseline `tauri-action` uses in CI. Use
# 22.04 (not 24.04) so the produced AppImage runs on glibc 2.35+, which
# covers everything from Ubuntu 22.04 through current rolling distros.
#
# Build:
#   docker build -f docker/build-linux.Dockerfile -t anchorworks-builder .
# Run (mounts project read-write, dumps the bundle into ./out):
#   mkdir -p out
#   docker run --rm -v "$PWD":/work -v "$PWD/out":/out anchorworks-builder

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Tauri 2 on Linux needs WebKitGTK 4.1, GTK3, AppIndicator, librsvg, plus
# the usual native-toolchain bits. `libudev-dev` is for `serialport`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget file ca-certificates pkg-config \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev libssl-dev libudev-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
    libxdo-dev \
    # xdg-utils ships `xdg-mime` which the AppImage bundler invokes when
    # tauri.conf.json declares fileAssociations (the .vstudio.json + .svg
    # entries). rpm-related tools so the rpm bundle stays linkable.
    xdg-utils rpm fakeroot \
 && rm -rf /var/lib/apt/lists/*

# Rust — pin a recent stable so the Dockerfile is deterministic across rebuilds.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.95.0 --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Node 20 — Tauri 2 dev tooling targets this LTS line.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Final build stage runs as the invoking user via `-u` so output files
# aren't owned by root on the host. The script itself lives in /usr/local/bin.
COPY docker/build-linux.sh /usr/local/bin/build-linux.sh
RUN chmod +x /usr/local/bin/build-linux.sh

WORKDIR /work
CMD ["/usr/local/bin/build-linux.sh"]
