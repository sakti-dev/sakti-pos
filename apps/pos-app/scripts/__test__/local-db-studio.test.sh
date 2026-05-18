#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SCRIPT_PATH="$REPO_ROOT/apps/pos-app/scripts/local-db-studio"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

DEVICE_SOURCE="$TMP_ROOT/device.sqlite"
HOST_ROOT="$TMP_ROOT/host-repo"
HOST_SNAPSHOT_PATH="$HOST_ROOT/.db-snapshots/latest.sqlite"
BIN_DIR="$TMP_ROOT/bin"
STUDIO_INVOCATION_PATH="$TMP_ROOT/studio-invocation.txt"
STUDIO_DB_URL_PATH="$TMP_ROOT/studio-db-url.txt"
TIMEOUT_SECONDS=4

mkdir -p "$HOST_ROOT/.db-snapshots" "$BIN_DIR"
mkdir -p "$HOST_ROOT/node_modules/.bin"
printf 'old snapshot' > "$HOST_SNAPSHOT_PATH"
printf 'first snapshot' > "$DEVICE_SOURCE"

cat > "$BIN_DIR/doas" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "sh" && "${2:-}" == "-c" ]]; then
  snapshot_source="${FAKE_DEVICE_SNAPSHOT_SOURCE:?}"
  snapshot_target="${6:?}"
  cat "$snapshot_source" > "$snapshot_target"
  chmod 0644 "$snapshot_target"
  exit 0
fi

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

cat > "$HOST_ROOT/node_modules/.bin/drizzle-kit" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "studio" ]]; then
  echo "unexpected drizzle-kit invocation: $*" >&2
  exit 1
fi

shift
host="127.0.0.1"
port="4983"
config_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      config_path="${2:-}"
      shift 2
      ;;
    --host)
      host="${2:-}"
      shift 2
      ;;
    --port)
      port="${2:-}"
      shift 2
      ;;
    --verbose)
      shift
      ;;
    *)
      echo "unexpected drizzle-kit arg: $1" >&2
      exit 1
      ;;
  esac
done

printf '%s\n' "drizzle-kit studio --config $config_path --host $host --port $port" > "${FAKE_STUDIO_INVOCATION_PATH:?}"
printf '%s\n' "${POS_APP_DB_URL:-}" > "${FAKE_STUDIO_DB_URL_PATH:?}"

exec python3 -m http.server "$port" --bind "$host"
EOF

chmod +x "$HOST_ROOT/node_modules/.bin/drizzle-kit"

set +e
PATH="$BIN_DIR:$PATH" \
APP_ROOT="$HOST_ROOT" \
FAKE_DEVICE_SNAPSHOT_SOURCE="$DEVICE_SOURCE" \
FAKE_EXPORT_URI="sakti-pos-dev://snapshot-export" \
FAKE_PACKAGE="com.sakti_dev.sakti_pos" \
FAKE_START_SNAPSHOT_CONTENT="exported by start: first snapshot" \
FAKE_STUDIO_INVOCATION_PATH="$STUDIO_INVOCATION_PATH" \
FAKE_STUDIO_DB_URL_PATH="$STUDIO_DB_URL_PATH" \
DRIZZLE_STUDIO_PORT=49174 \
SNAPSHOT_WAIT_SECONDS=2 \
timeout "$TIMEOUT_SECONDS" bash "$SCRIPT_PATH"
FIRST_EXIT_CODE="$?"
set -e

if [[ "$FIRST_EXIT_CODE" -ne 124 ]]; then
  echo "expected first snapshot sync to block until timeout, got exit code $FIRST_EXIT_CODE" >&2
  exit 1
fi

if [[ "$(cat "$HOST_SNAPSHOT_PATH")" != "exported by start: first snapshot" ]]; then
  echo "host snapshot was not overwritten on first sync" >&2
  exit 1
fi

if [[ "$(stat -c '%u %a' "$HOST_SNAPSHOT_PATH")" != "$(id -u) 644" ]]; then
  echo "host snapshot does not have expected ownership and permissions after first sync" >&2
  exit 1
fi

if [[ "$(cat "$STUDIO_INVOCATION_PATH")" != "drizzle-kit studio --config $HOST_ROOT/drizzle.config.ts --host 127.0.0.1 --port 49174" ]]; then
  echo "drizzle studio was not launched with the expected args on first sync" >&2
  exit 1
fi

if [[ "$(cat "$STUDIO_DB_URL_PATH")" != "file:$HOST_SNAPSHOT_PATH" ]]; then
  echo "drizzle studio did not receive the expected snapshot db url on first sync" >&2
  exit 1
fi

set +e
PATH="$BIN_DIR:$PATH" \
APP_ROOT="$HOST_ROOT" \
FAKE_DEVICE_SNAPSHOT_SOURCE="$DEVICE_SOURCE" \
FAKE_EXPORT_URI="sakti-pos-dev://snapshot-export" \
FAKE_PACKAGE="com.sakti_dev.sakti_pos" \
FAKE_START_SNAPSHOT_CONTENT="exported by start: second snapshot" \
FAKE_STUDIO_INVOCATION_PATH="$STUDIO_INVOCATION_PATH" \
FAKE_STUDIO_DB_URL_PATH="$STUDIO_DB_URL_PATH" \
DRIZZLE_STUDIO_PORT=49174 \
SNAPSHOT_WAIT_SECONDS=2 \
timeout "$TIMEOUT_SECONDS" bash "$SCRIPT_PATH"
SECOND_EXIT_CODE="$?"
set -e

if [[ "$SECOND_EXIT_CODE" -ne 124 ]]; then
  echo "expected second snapshot sync to block until timeout, got exit code $SECOND_EXIT_CODE" >&2
  exit 1
fi

if [[ "$(cat "$HOST_SNAPSHOT_PATH")" != "exported by start: second snapshot" ]]; then
  echo "host snapshot was not overwritten on second sync" >&2
  exit 1
fi

if [[ "$(stat -c '%u %a' "$HOST_SNAPSHOT_PATH")" != "$(id -u) 644" ]]; then
  echo "host snapshot does not have expected ownership and permissions after second sync" >&2
  exit 1
fi

if [[ "$(cat "$STUDIO_INVOCATION_PATH")" != "drizzle-kit studio --config $HOST_ROOT/drizzle.config.ts --host 127.0.0.1 --port 49174" ]]; then
  echo "drizzle studio was not launched with the expected args on second sync" >&2
  exit 1
fi

if [[ "$(cat "$STUDIO_DB_URL_PATH")" != "file:$HOST_SNAPSHOT_PATH" ]]; then
  echo "drizzle studio did not receive the expected snapshot db url on second sync" >&2
  exit 1
fi
