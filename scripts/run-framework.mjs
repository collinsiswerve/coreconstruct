import { spawnSync } from "node:child_process";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

function run(executable, parameters) {
  const result = spawnSync(executable, parameters, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const vite = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
const vinext = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);

if (command === "dev") {
  // Import in this process so the preview owner retains its PID and signals.
  const cli = managedLinux ? vite : vinext;
  process.argv = [process.execPath, fileURLToPath(cli), command,
    ...(!managedLinux ? ["--port", "5173"] : []), ...args];
  await import(cli.href);
} else {
  if (managedLinux) run("bash", [fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args]);
  else run(process.execPath, [fileURLToPath(vinext), "build", ...args]);
  run(process.execPath, [fileURLToPath(vite), "build", "--config", "vite.preview.config.ts"]);
  await cp(new URL("../dist/pages-demo/", import.meta.url), new URL("../dist/client/portfolio/", import.meta.url), { recursive: true });
}
