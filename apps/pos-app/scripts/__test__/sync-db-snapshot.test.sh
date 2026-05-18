#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SCRIPT_PATH="$REPO_ROOT/apps/pos-app/scripts/sync-db-snapshot"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

DEVICE_SOURCE="$TMP_ROOT/device.sqlite"
HOST_ROOT="$TMP_ROOT/host-repo"
HOST_SNAPSHOT_PATH="$HOST_ROOT/.db-snapshots/latest.sqlite"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$HOST_ROOT/.db-snapshots" "$BIN_DIR"
printf 'old snapshot' > "$HOST_SNAPSHOT_PATH"
printf 'first snapshot' > "$DEVICE_SOURCE"

cat > "$BIN_DIR/doas" <<'EOF'
#!/usr/bin/env bash
exec "$@"
EOF

cat > "$BIN_DIR/adb" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "shell" || "${2:-}" != "am" || "${3:-}" != "start" || "${4:-}" != "-W" || "${5:-}" != "-a" || "${6:-}" != "android.intent.action.VIEW" || "${7:-}" != "-d" || "${8:-}" != "${FAKE_EXPORT_URI:?}" || "${9:-}" != "${FAKE_PACKAGE:?}" ]]; then
  echo "unexpected adb invocation: $*" >&2
  exit 1
fi

printf '%s' "${FAKE_START_SNAPSHOT_CONTENT:?}" > "${FAKE_DEVICE_SNAPSHOT_SOURCE:?}"
EOF

cat > "$BIN_DIR/waydroid" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "shell" || "${2:-}" != "--" ]]; then
  echo "unexpected waydroid invocation: $*" >&2
  exit 1
fi

case "${3:-}" in
  am)
    echo "unexpected waydroid broadcast invocation: $*" >&2
    exit 1
    ;;
  cat)
    cat "${FAKE_DEVICE_SNAPSHOT_SOURCE:?}"
    ;;
  rm)
    if [[ "${4:-}" != "-f" ]]; then
      echo "unexpected rm invocation: $*" >&2
      exit 1
    fi
    rm -f "${FAKE_DEVICE_SNAPSHOT_SOURCE:?}"
    ;;
  test)
    if [[ "${4:-}" != "-s" ]]; then
      echo "unexpected test invocation: $*" >&2
      exit 1
    fi
    [[ -s "${FAKE_DEVICE_SNAPSHOT_SOURCE:?}" ]]
    ;;
  *)
    echo "unexpected waydroid subcommand: $*" >&2
    exit 1
    ;;
esac
EOF

chmod +x "$BIN_DIR/doas" "$BIN_DIR/waydroid"
chmod +x "$BIN_DIR/adb"

PATH="$BIN_DIR:$PATH" \
APP_ROOT="$HOST_ROOT" \
FAKE_DEVICE_SNAPSHOT_SOURCE="$DEVICE_SOURCE" \
FAKE_EXPORT_URI="sakti-pos-dev://snapshot-export" \
FAKE_PACKAGE="com.sakti_dev.sakti_pos" \
FAKE_START_SNAPSHOT_CONTENT="exported by start: first snapshot" \
SNAPSHOT_WAIT_SECONDS=2 \
bash "$SCRIPT_PATH"

if [[ "$(cat "$HOST_SNAPSHOT_PATH")" != "exported by start: first snapshot" ]]; then
  echo "host snapshot was not overwritten on first sync" >&2
  exit 1
fi

if [[ "$(stat -c '%u %a' "$HOST_SNAPSHOT_PATH")" != "$(id -u) 644" ]]; then
  echo "host snapshot does not have expected ownership and permissions after first sync" >&2
  exit 1
fi

PATH="$BIN_DIR:$PATH" \
APP_ROOT="$HOST_ROOT" \
FAKE_DEVICE_SNAPSHOT_SOURCE="$DEVICE_SOURCE" \
FAKE_EXPORT_URI="sakti-pos-dev://snapshot-export" \
FAKE_PACKAGE="com.sakti_dev.sakti_pos" \
FAKE_START_SNAPSHOT_CONTENT="exported by start: second snapshot" \
SNAPSHOT_WAIT_SECONDS=2 \
bash "$SCRIPT_PATH"

if [[ "$(cat "$HOST_SNAPSHOT_PATH")" != "exported by start: second snapshot" ]]; then
  echo "host snapshot was not overwritten on second sync" >&2
  exit 1
fi

if [[ "$(stat -c '%u %a' "$HOST_SNAPSHOT_PATH")" != "$(id -u) 644" ]]; then
  echo "host snapshot does not have expected ownership and permissions after second sync" >&2
  exit 1
fi
