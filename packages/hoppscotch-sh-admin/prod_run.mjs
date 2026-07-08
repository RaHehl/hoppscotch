#!/usr/local/bin/node
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';

// Caddy bind port — when set, must be an unprivileged integer (1024-65535).
const altPort = process.env.HOPP_ALTERNATE_PORT;
if (altPort !== undefined && !(/^[0-9]+$/.test(altPort) && +altPort >= 1024 && +altPort <= 65535)) {
  console.error(
    `HOPP_ALTERNATE_PORT="${altPort}" is invalid: it must be an integer between 1024 and 65535 ` +
      `(e.g. 8000). Privileged ports < 1024 cannot be bound by a non-root user. Avoid ports used by ` +
      `internal services: 8080 (backend), 3200 (webapp server), 3000/3100/3170 (Caddy).`
  );
  process.exit(1);
}

function runChildProcessWithPrefix(command, args, prefix) {
  const childProcess = spawn(command, args);

  childProcess.stdout.on('data', (data) => {
    const output = data.toString().trim().split('\n');
    output.forEach((line) => {
      console.log(`${prefix} | ${line}`);
    });
  });

  childProcess.stderr.on('data', (data) => {
    const error = data.toString().trim().split('\n');
    error.forEach((line) => {
      console.error(`${prefix} | ${line}`);
    });
  });

  childProcess.on('close', (code) => {
    console.log(`${prefix} Child process exited with code ${code}`);
  });

  childProcess.on('error', (stuff) => {
    console.log('error');
    console.log(stuff);
  });

  return childProcess;
}

const envFileContent = Object.entries(process.env)
  .filter(([env]) => env.startsWith('VITE_'))
  .sort(([envA], [envB]) => envA.localeCompare(envB))
  .map(
    ([env, val]) =>
      `${env}=${val.startsWith('"') && val.endsWith('"') ? val : `"${val}"`}`
  )
  .join('\n');

const subpathBasedAccess = process.env.ENABLE_SUBPATH_BASED_ACCESS === 'true';
const distName = subpathBasedAccess
  ? 'sh-admin-subpath-access'
  : 'sh-admin-multiport-setup';

// Render the entry document's runtime env into a writable directory, leaving the
// shipped assets in /site immutable (so the container can run with a read-only root
// filesystem). Caddy serves the hashed assets from /site and this rendered
// index.html; only index.html carries the @import-meta-env placeholder.
const runtimeDir = `${process.env.HOPP_RUNTIME_DIR || '/tmp/hopp-site'}/${distName}`;
fs.mkdirSync(runtimeDir, { recursive: true });
fs.copyFileSync(`/site/${distName}/index.html`, `${runtimeDir}/index.html`);

// Write to a temp dir (not cwd) so a non-root UID needn't own the working directory.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hopp-env-'));
const buildEnvPath = path.join(tmpDir, 'build.env');

try {
  fs.writeFileSync(buildEnvPath, envFileContent);
  // Call the global binary directly (not npx, which needs a writable $HOME cache).
  execFileSync('import-meta-env', ['-x', buildEnvPath, '-e', buildEnvPath, '-p', `${runtimeDir}/index.html`], { stdio: 'inherit' });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const caddyFileName = `${distName}.Caddyfile`;
const caddyProcess = runChildProcessWithPrefix(
  'caddy',
  ['run', '--config', `/etc/caddy/${caddyFileName}`, '--adapter', 'caddyfile'],
  'App/Admin Dashboard Caddy'
);

caddyProcess.on('exit', (code) => {
  console.log(`Exiting process because Caddy Server exited with code ${code}`);
  process.exit(code);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, exiting...');

  caddyProcess.kill('SIGINT');

  process.exit(0);
});
