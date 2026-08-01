#!/usr/bin/env bash
# Stop Forge and ComfyUI started by start-image-backends.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT}/vendors/run"

stop_one() {
  local name="$1"
  local pid_file="${PID_DIR}/${name}.pid"
  if [[ ! -f "${pid_file}" ]]; then
    echo "${name}: no pid file"
    return 0
  fi
  local pid
  pid="$(cat "${pid_file}")"
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "${name}: not running (stale pid ${pid})"
    rm -f "${pid_file}"
    return 0
  fi
  echo "→ stopping ${name} (pid ${pid})"
  # Kill process group if possible (webui.sh spawns children).
  kill "${pid}" 2>/dev/null || true
  # Also try process group (negative pid) when started in its own group.
  kill -- "-${pid}" 2>/dev/null || true
  local i
  for i in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "${pid}" 2>/dev/null; then
    echo "  ${name} still alive; sending SIGKILL"
    kill -9 "${pid}" 2>/dev/null || true
    kill -9 -- "-${pid}" 2>/dev/null || true
  fi
  rm -f "${pid_file}"
}

# Best-effort: also clear listeners on default ports if pid files missed children.
free_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "→ freeing port ${port}: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 0.5
    pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      # shellcheck disable=SC2086
      kill -9 ${pids} 2>/dev/null || true
    fi
  fi
}

main() {
  stop_one "forge"
  stop_one "comfyui"
  free_port 7860
  free_port 8188
  echo "Backends stopped."
}

main "$@"
