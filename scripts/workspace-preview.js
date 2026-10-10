#!/usr/bin/env node
// A development-only, loopback-only review surface. Its API proxy fails closed.
const {spawn} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const preview = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3101'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW: 'true',
    NEXT_PUBLIC_DISABLE_AUTH_GATE: 'true',
    NEXT_PUBLIC_TACO_WORKSPACE_DESIGN: process.env.NEXT_PUBLIC_TACO_WORKSPACE_DESIGN || 'paper',
  },
});
preview.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
preview.on('exit', code => { process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { preview.kill(signal); });
