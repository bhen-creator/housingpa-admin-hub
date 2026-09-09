#!/usr/bin/env node
/**
 * Build script. One dependency: esbuild.
 *   node build.mjs            production build into dist/
 *   node build.mjs --watch    rebuild on change and run the server
 */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(path.join(out, 'public'), {recursive: true});

const shared = {
  bundle: true,
  logLevel: 'info',
};

const clientOptions = {
  ...shared,
  entryPoints: [path.join(root, 'client/main.tsx')],
  outfile: path.join(out, 'public/app.js'),
  platform: 'browser',
  format: 'esm',
  target: ['chrome111', 'firefox115', 'safari16', 'edge111'],
  jsx: 'automatic',
  // Only the client gets NODE_ENV baked in - the server must read the real
  // environment at runtime, or it would always believe it is in production.
  define: {'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')},
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  loader: {'.svg': 'dataurl', '.png': 'dataurl'},
};

const serverOptions = {
  ...shared,
  entryPoints: [path.join(root, 'server/index.ts')],
  outfile: path.join(out, 'server.mjs'),
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  minify: false,
  sourcemap: dev ? 'inline' : false,
  banner: {js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"},
};

function copyStatic() {
  fs.copyFileSync(path.join(root, 'client/index.html'), path.join(out, 'public/index.html'));
  fs.copyFileSync(path.join(root, 'client/app.css'), path.join(out, 'public/app.css'));
  const favicon = path.join(root, 'client/favicon.svg');
  if (fs.existsSync(favicon)) fs.copyFileSync(favicon, path.join(out, 'public/favicon.svg'));
}

if (watch) {
  const clientCtx = await esbuild.context(clientOptions);
  const serverCtx = await esbuild.context(serverOptions);
  await clientCtx.watch();
  await serverCtx.watch();
  copyStatic();
  fs.watch(path.join(root, 'client'), {recursive: true}, (_e, file) => {
    if (file && /\.(html|css|svg)$/.test(file)) copyStatic();
  });

  let child = null;
  const restart = () => {
    if (child) child.kill();
    child = spawn(process.execPath, ['--experimental-sqlite', path.join(out, 'server.mjs')], {
      stdio: 'inherit',
      env: {...process.env, NODE_ENV: 'development'},
    });
  };
  restart();
  fs.watchFile(path.join(out, 'server.mjs'), {interval: 400}, restart);
  console.log('\n  watching — http://localhost:' + (process.env.PORT || 8080) + '\n');
} else {
  await esbuild.build(clientOptions);
  await esbuild.build(serverOptions);
  copyStatic();
  const size = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' kB';
  console.log(`\n  client  ${size(path.join(out, 'public/app.js'))}`);
  console.log(`  server  ${size(path.join(out, 'server.mjs'))}\n`);
}
