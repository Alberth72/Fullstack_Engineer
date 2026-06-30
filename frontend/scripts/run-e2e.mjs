import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "cmd.exe" : "npm";
const npxCmd = isWindows ? "cmd.exe" : "npx";
const startArgs = isWindows ? ["/d", "/s", "/c", "npm run start:e2e"] : ["run", "start:e2e"];
const testArgs = isWindows ? ["/d", "/s", "/c", "npx playwright test"] : ["playwright", "test"];
const baseUrl = "http://127.0.0.1:3000";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // keep waiting until the server is ready
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(child) {
  if (!child || child.killed) {
    return;
  }

  if (isWindows) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: projectRoot,
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await delay(2000);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

const server = spawn(npmCmd, startArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

let exitCode = 0;

try {
  console.log("[e2e] waiting for server");
  await waitForServer(baseUrl);
  console.log("[e2e] server ready, running playwright");
  await run(npxCmd, testArgs);
  console.log("[e2e] playwright finished");
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  console.log("[e2e] stopping server");
  await stopServer(server);
  console.log("[e2e] server stopped");
}

process.exit(exitCode);
