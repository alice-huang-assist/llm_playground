#!/usr/bin/env bash
# Start Forge (:7860) and ComfyUI (:8188) from vendors/. Apple Silicon.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDORS="${ROOT}/vendors"
FORGE_DIR="${VENDORS}/stable-diffusion-webui-forge"
COMFY_DIR="${VENDORS}/ComfyUI"
LOG_DIR="${VENDORS}/logs"
PID_DIR="${VENDORS}/run"

die() {
  echo "error: $*" >&2
  exit 1
}

require_install() {
  [[ -d "${FORGE_DIR}" ]] || die "Forge not found at ${FORGE_DIR}. Run: npm run install:backends"
  [[ -d "${COMFY_DIR}" ]] || die "ComfyUI not found at ${COMFY_DIR}. Run: npm run install:backends"
  [[ -x "${FORGE_DIR}/webui.sh" || -f "${FORGE_DIR}/webui.sh" ]] || die "Forge webui.sh missing"
  [[ -x "${COMFY_DIR}/venv/bin/python" ]] || die "ComfyUI venv missing. Run: npm run install:backends"
}

is_running() {
  local pid_file="$1"
  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
    rm -f "${pid_file}"
  fi
  return 1
}

start_forge() {
  local pid_file="${PID_DIR}/forge.pid"
  if is_running "${pid_file}"; then
    echo "Forge already running (pid $(cat "${pid_file}"))"
    return 0
  fi
  mkdir -p "${LOG_DIR}" "${PID_DIR}"
  echo "→ starting Forge on 127.0.0.1:7860 (log: ${LOG_DIR}/forge.log)"
  (
    cd "${FORGE_DIR}"
    export PYTORCH_ENABLE_MPS_FALLBACK=1
    # webui-user.sh supplies COMMANDLINE_ARGS (--api, port, Mac flags).
    # macOS has no setsid(1); stop script frees ports as a fallback.
    nohup bash ./webui.sh >"${LOG_DIR}/forge.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  echo "  Forge pid $(cat "${pid_file}")"
}

start_comfy() {
  local pid_file="${PID_DIR}/comfyui.pid"
  if is_running "${pid_file}"; then
    echo "ComfyUI already running (pid $(cat "${pid_file}"))"
    return 0
  fi
  mkdir -p "${LOG_DIR}" "${PID_DIR}"
  echo "→ starting ComfyUI on 127.0.0.1:8188 (log: ${LOG_DIR}/comfyui.log)"
  (
    cd "${COMFY_DIR}"
    export PYTORCH_ENABLE_MPS_FALLBACK=1
    nohup ./venv/bin/python main.py --listen 127.0.0.1 --port 8188 \
      >"${LOG_DIR}/comfyui.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  echo "  ComfyUI pid $(cat "${pid_file}")"
}

main() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  if [[ "${os}" != "Darwin" || "${arch}" != "arm64" ]]; then
    die "backends:start supports Apple Silicon (darwin/arm64) only (got ${os}/${arch})."
  fi
  require_install
  start_forge
  start_comfy
  echo
  echo "Backends starting. First Forge boot can take several minutes while it finishes setup."
  echo "Logs: ${LOG_DIR}/forge.log  ${LOG_DIR}/comfyui.log"
  echo "Stop with: npm run backends:stop"
  echo "Note: running both on M4 unified memory can OOM with large checkpoints; stop one if needed."
}

main "$@"
