#!/usr/bin/env bash
# Builds self-contained Watchman binaries (pure Go, no libpostal/CGO) for every
# desktop target. The official macOS release links /usr/local/lib/libpostal and
# can't be shipped; the default build tag uses a pure-Go address parser instead.
# Requires Go 1.24+. Output names follow Node's platform/arch naming.
set -euo pipefail
VERSION="${WATCHMAN_VERSION:-v1.2.1}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/resources/bin"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "https://github.com/moov-io/watchman/archive/refs/tags/${VERSION}.tar.gz" | tar xz -C "$WORK"
cd "$WORK/watchman-${VERSION#v}"
mkdir -p "$OUT"
for target in darwin/arm64:darwin-arm64 darwin/amd64:darwin-x64 windows/amd64:win32-x64.exe linux/amd64:linux-x64 linux/arm64:linux-arm64; do
  goos_arch="${target%%:*}"; name="${target#*:}"
  CGO_ENABLED=0 GOOS="${goos_arch%/*}" GOARCH="${goos_arch#*/}" \
    go build -trimpath -ldflags "-s -w -X github.com/moov-io/watchman.Version=${VERSION}" \
    -o "$OUT/watchman-${name}" ./cmd/server
  echo "built watchman-${name}"
done
