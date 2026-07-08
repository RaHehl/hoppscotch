#!/usr/local/bin/node
import { execSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// Serve from a relocatable root so the startup env rewrite targets a writable
// location even when the container root filesystem is read-only (e.g. Kubernetes
// readOnlyRootFilesystem). Defaults to the baked /site, so behaviour is unchanged
// unless HOPP_SITE_ROOT points elsewhere (e.g. a subdir of a mounted /tmp volume).
const siteRoot = process.env.HOPP_SITE_ROOT || "/site"
if (siteRoot !== "/site") {
  fs.cpSync("/site", siteRoot, { recursive: true })
}

const envFileContent = Object.entries(process.env)
  .filter(([env]) => env.startsWith("VITE_"))
  .sort(([envA], [envB]) => envA.localeCompare(envB))
  .map(
    ([env, val]) =>
      `${env}=${val.startsWith('"') && val.endsWith('"') ? val : `"${val}"`}`
  )
  .join("\n")

const buildEnv = path.join(os.tmpdir(), "build.env")
fs.writeFileSync(buildEnv, envFileContent)

execSync(`npx import-meta-env -x ${buildEnv} -e ${buildEnv} -p "${siteRoot}/**/*"`)

fs.rmSync(buildEnv)
