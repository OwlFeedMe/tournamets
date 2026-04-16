#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-main}"
LOCK_FILE="${LOCK_FILE:-/tmp/finalrep-auto-deploy.lock}"
LOG_PREFIX="[finalrep-auto-deploy]"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$LOG_PREFIX another run active"
  exit 0
fi

echo "$LOG_PREFIX checking $REMOTE_NAME/$BRANCH_NAME"
git fetch --quiet "$REMOTE_NAME" "$BRANCH_NAME"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  echo "$LOG_PREFIX no changes"
  exit 0
fi

echo "$LOG_PREFIX new commit $LOCAL_SHA -> $REMOTE_SHA"
git reset --hard "$REMOTE_SHA"
bash "$ROOT_DIR/deploy.sh"
echo "$LOG_PREFIX deploy done"
