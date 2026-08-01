#!/usr/bin/env node
/**
 * Start Forge + ComfyUI, then run a Next.js command (dev or start).
 * On exit / SIGINT / SIGTERM, stop the image backends.
 *
 * Usage: node scripts/run-with-backends.mjs <next-script>
 *   next-script: "dev" | "start"
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mode = process.argv[2];

if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-with-backends.mjs <dev|start>");
  process.exit(1);
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function runDetach(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

let nextChild = null;
let stopping = false;

async function stopBackends() {
  if (stopping) return;
  stopping = true;
  console.log("\n→ stopping image backends…");
  try {
    await run("bash", [path.join(root, "scripts/stop-image-backends.sh")]);
  } catch (err) {
    console.error("warning: backends stop failed:", err.message ?? err);
  }
}

async function main() {
  const startCode = await runDetach("bash", [
    path.join(root, "scripts/start-image-backends.sh"),
  ]);
  if (startCode !== 0) {
    process.exit(startCode);
  }

  const nextArgs =
    mode === "dev"
      ? ["next", "dev"]
      : ["next", "start"];

  nextChild = spawn("npx", nextArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  const shutdown = async () => {
    if (nextChild && !nextChild.killed) {
      nextChild.kill("SIGTERM");
    }
    await stopBackends();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  nextChild.on("exit", (code) => {
    void (async () => {
      await stopBackends();
      process.exit(code ?? 0);
    })();
  });
}

main().catch(async (err) => {
  console.error(err);
  await stopBackends();
  process.exit(1);
});
