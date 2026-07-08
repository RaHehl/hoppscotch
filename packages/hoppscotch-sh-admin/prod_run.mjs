#!/usr/local/bin/node
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';

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

// Serve from a relocatable root so the startup env rewrite targets a writable
// location even when the container root filesystem is read-only (e.g. Kubernetes
// readOnlyRootFilesystem). Defaults to the baked /site, so behaviour is unchanged
// unless HOPP_SITE_ROOT points elsewhere (e.g. a subdir of a mounted /tmp volume).
const siteRoot = process.env.HOPP_SITE_ROOT || '/site';
if (siteRoot !== '/site') {
  fs.cpSync('/site', siteRoot, { recursive: true });
}

const envFileContent = Object.entries(process.env)
  .filter(([env]) => env.startsWith('VITE_'))
  .sort(([envA], [envB]) => envA.localeCompare(envB))
  .map(
    ([env, val]) =>
      `${env}=${val.startsWith('"') && val.endsWith('"') ? val : `"${val}"`}`
  )
  .join('\n');

const buildEnv = path.join(os.tmpdir(), 'build.env');
fs.writeFileSync(buildEnv, envFileContent);

execSync(`npx import-meta-env -x ${buildEnv} -e ${buildEnv} -p "${siteRoot}/**/*"`);

fs.rmSync(buildEnv);

const caddyFileName =
  process.env.ENABLE_SUBPATH_BASED_ACCESS === 'true'
    ? 'sh-admin-subpath-access.Caddyfile'
    : 'sh-admin-multiport-setup.Caddyfile';
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
