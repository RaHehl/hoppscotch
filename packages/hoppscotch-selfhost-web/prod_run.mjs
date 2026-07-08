#!/usr/local/bin/node
import { execFileSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// Caddy bind port — when set, must be an unprivileged integer (1024-65535).
const altPort = process.env.HOPP_ALTERNATE_PORT
if (altPort !== undefined && !(/^[0-9]+$/.test(altPort) && +altPort >= 1024 && +altPort <= 65535)) {
  console.error(
    `HOPP_ALTERNATE_PORT="${altPort}" is invalid: it must be an integer between 1024 and 65535 ` +
    `(e.g. 8000). Privileged ports < 1024 cannot be bound by a non-root user. Avoid ports used by ` +
    `internal services: 8080 (backend), 3200 (webapp server), 3000/3100/3170 (Caddy).`
  )
  process.exit(1)
}

const envFileContent = Object.entries(process.env)
  .filter(([env]) => env.startsWith("VITE_"))
  .sort(([envA], [envB]) => envA.localeCompare(envB))
  .map(
    ([env, val]) =>
      `${env}=${val.startsWith('"') && val.endsWith('"') ? val : `"${val}"`}`
  )
  .join("\n")

// Render the entry document's runtime env into a writable directory, leaving the
// shipped assets in /site immutable (so the container can run with a read-only root
// filesystem). Caddy serves the hashed assets from /site and this rendered
// index.html; only index.html carries the @import-meta-env placeholder.
const runtimeDir = `${process.env.HOPP_RUNTIME_DIR || "/tmp/hopp-site"}/selfhost-web`
fs.mkdirSync(runtimeDir, { recursive: true })
fs.copyFileSync("/site/selfhost-web/index.html", `${runtimeDir}/index.html`)

// Write to a temp dir (not cwd) so a non-root UID needn't own the working directory.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hopp-env-"))
const buildEnvPath = path.join(tmpDir, "build.env")

try {
  fs.writeFileSync(buildEnvPath, envFileContent)
  // Call the global binary directly (not npx, which needs a writable $HOME cache).
  execFileSync("import-meta-env", ["-x", buildEnvPath, "-e", buildEnvPath, "-p", `${runtimeDir}/index.html`], { stdio: "inherit" })
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
