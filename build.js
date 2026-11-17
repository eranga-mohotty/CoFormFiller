#!/usr/bin/env node

/**
 * SmartForm AI - Extension Build Pipeline (esbuild)
 * Bundles TypeScript / JavaScript ES module entry points and copies static assets to dist/.
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const distDir = path.resolve(rootDir, 'dist');

const ENTRY_DEFINITIONS = [
  'src/background/service-worker',
  'src/content/content',
  'src/content/inserter',
  'src/engine/scanner',
  'src/engine/pattern-matcher',
  'src/popup/popup',
  'src/options/options'
];

/**
 * Resolves each entry point, preferring .ts if present, falling back to .js.
 * @returns {Record<string, string>}
 */
function resolveEntryPoints() {
  const resolved = {};
  for (const entry of ENTRY_DEFINITIONS) {
    const tsPath = path.resolve(rootDir, `${entry}.ts`);
    const jsPath = path.resolve(rootDir, `${entry}.js`);

    if (fs.existsSync(tsPath)) {
      resolved[entry] = tsPath;
    } else if (fs.existsSync(jsPath)) {
      resolved[entry] = jsPath;
    } else {
      throw new Error(`Entry point not found for "${entry}" (.ts or .js)`);
    }
  }
  return resolved;
}

/**
 * Recursively copies files matching extensions from src to dest.
 * @param {string} src
 * @param {string} dest
 * @param {string[]} exts
 */
function copyMatchingFiles(src, dest, exts) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'icons') {
        copyMatchingFiles(srcPath, destPath, exts);
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copies all static assets (manifest.json, icons, test-forms, html/css) into dist/.
 */
function copyStaticAssets() {
  fs.mkdirSync(distDir, { recursive: true });

  const manifestSrc = path.resolve(rootDir, 'manifest.json');
  const manifestDest = path.resolve(distDir, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, manifestDest);
  }

  const iconsSrc = path.resolve(rootDir, 'src/icons');
  const iconsDest = path.resolve(distDir, 'src/icons');
  if (fs.existsSync(iconsSrc)) {
    fs.mkdirSync(iconsDest, { recursive: true });
    fs.cpSync(iconsSrc, iconsDest, { recursive: true });
  }

  const testFormsSrc = path.resolve(rootDir, 'test-forms');
  const testFormsDest = path.resolve(distDir, 'test-forms');
  if (fs.existsSync(testFormsSrc)) {
    fs.mkdirSync(testFormsDest, { recursive: true });
    fs.cpSync(testFormsSrc, testFormsDest, { recursive: true });
  }

  const srcDir = path.resolve(rootDir, 'src');
  const srcDistDir = path.resolve(distDir, 'src');
  copyMatchingFiles(srcDir, srcDistDir, ['.html', '.css']);
}

/**
 * esbuild plugin to copy static assets on every successful build/rebuild.
 */
const copyAssetsPlugin = {
  name: 'copy-static-assets',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        copyStaticAssets();
        console.log('[build] Static assets copied to dist/');
      }
    });
  }
};

/**
 * Starts watch mode for esbuild and static assets.
 * @param {esbuild.BuildOptions} buildOptions
 */
async function startWatchMode(buildOptions) {
  console.log('[build] Starting esbuild in watch mode...');
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();

  const watchTargets = [
    path.resolve(rootDir, 'manifest.json'),
    path.resolve(rootDir, 'src'),
    path.resolve(rootDir, 'test-forms')
  ];

  for (const target of watchTargets) {
    if (!fs.existsSync(target)) continue;
    fs.watch(target, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename);
      if (['.html', '.css', '.json', '.png', '.svg'].includes(ext) || target.endsWith('test-forms')) {
        try {
          copyStaticAssets();
          console.log(`[build] Asset updated (${filename}), re-copied static assets.`);
        } catch (err) {
          console.error('[build] Failed to re-copy static assets:', err.message);
        }
      }
    });
  }
  console.log('[build] Watching for changes. Press Ctrl+C to exit.');
}

/**
 * Main build execution entry point.
 */
async function main() {
  const isWatch = process.argv.includes('--watch');
  const entryPoints = resolveEntryPoints();

  const buildOptions = {
    entryPoints,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    outdir: distDir,
    outbase: rootDir,
    logLevel: 'info',
    plugins: [copyAssetsPlugin]
  };

  if (isWatch) {
    await startWatchMode(buildOptions);
  } else {
    console.log('[build] Cleaning dist/ directory...');
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('[build] Building production bundle in dist/...');
    const ctx = await esbuild.context(buildOptions);
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[build] Build completed successfully.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[build] Build error:', err);
    process.exit(1);
  });
}
