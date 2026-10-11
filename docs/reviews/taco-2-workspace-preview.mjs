import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(repo, 'docs/reviews/taco-2-workspace-preview');
const output = resolve(repo, 'output/taco-2-workspace-preview');
const argumentsList = process.argv.slice(2);
const portArgument = argumentsList.find(value => value.startsWith('--port='));
const port = portArgument ? Number(portArgument.slice(7)) : 3112;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Choose a local port between 1024 and 65535.');
}

await mkdir(output, { recursive: true });
await build({
  entryPoints: [resolve(source, 'index.tsx')],
  outfile: resolve(output, 'bundle.js'),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': repo },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
console.log('Built the isolated Taco 2.0 workspace concept.');

if (!argumentsList.includes('--build')) {
  const routes = new Map([
    ['/', [resolve(source, 'index.html'), 'text/html; charset=utf-8']],
    ['/index.html', [resolve(source, 'index.html'), 'text/html; charset=utf-8']],
    ['/bundle.js', [resolve(output, 'bundle.js'), 'text/javascript; charset=utf-8']],
    ['/tokens.css', [resolve(source, 'tokens.css'), 'text/css; charset=utf-8']],
    ['/styles.css', [resolve(source, 'styles.css'), 'text/css; charset=utf-8']],
    ['/public/fonts/Inter-Regular.ttf', [resolve(repo, 'public/fonts/Inter-Regular.ttf'), 'font/ttf']],
    ['/public/fonts/Inter-Bold.ttf', [resolve(repo, 'public/fonts/Inter-Bold.ttf'), 'font/ttf']],
    ['/public/brand/taco-mark.svg', [resolve(repo, 'public/brand/taco-mark.svg'), 'image/svg+xml']],
  ]);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end('This local preview accepts only file reads.');
      return;
    }
    const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    if (path === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const route = routes.get(path);
    if (!route) {
      response.writeHead(404);
      response.end('Preview file not found.');
      return;
    }
    try {
      const body = await readFile(route[0]);
      response.writeHead(200, { 'Content-Type': route[1] });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500);
      response.end('The preview file could not be read.');
    }
  });
  server.on('error', error => {
    console.error(`Could not start the local preview: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Review the concept at http://127.0.0.1:${port}/`);
    console.log('No app credentials or remote services are used.');
  });
}
