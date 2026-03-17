const fs = require('fs');
const path = require('path');
const { defineConfig } = require('vite');

const ROOT = __dirname;
const TARGET = process.env.VITE_TARGET || 'js';
const SCOPE = (process.env.VITE_SCOPE || '').replace(/^\/+|\/+$/g, '');

const TARGETS = {
  js: {
    outDir: '.vite-build/js',
    roots: ['blocks', 'scripts'],
    sourceExtensions: ['.ts', '.js'],
  },
  css: {
    outDir: '.vite-build/css',
    roots: ['blocks', 'styles'],
    sourceExtensions: ['.scss', '.css'],
  },
};

if (!TARGETS[TARGET]) {
  throw new Error(`Unsupported VITE_TARGET: ${TARGET}`);
}

const EXCLUDED_ENTRIES = new Set([
  'scripts/aem',
  'styles/fonts',
]);

/**
 * Recursively collects files under a directory.
 * @param {string} dirPath
 * @returns {string[]}
 */
function collectFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const entries = [];
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
  dirents.forEach((dirent) => {
    const absolutePath = path.join(dirPath, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...collectFiles(absolutePath));
      return;
    }
    entries.push(absolutePath);
  });

  return entries;
}

/**
 * Builds a Rollup input map from EDS runtime files.
 * Prefers source files (.ts/.scss) over runtime files (.js/.css) when both exist.
 * @returns {Record<string, string>}
 */
function buildInputMap() {
  const input = {};
  const { roots, sourceExtensions } = TARGETS[TARGET];

  roots.forEach((rootDir) => {
    const files = collectFiles(path.join(ROOT, rootDir));
    const selected = new Map();

    files.forEach((absolutePath) => {
      const relativePath = path.relative(ROOT, absolutePath).replace(/\\/g, '/');
      const extension = path.extname(relativePath);
      const extensionIndex = sourceExtensions.indexOf(extension);
      if (extensionIndex === -1) return;

      const withoutExt = relativePath.slice(0, -extension.length);
      if (EXCLUDED_ENTRIES.has(withoutExt)) return;
      if (SCOPE && !withoutExt.startsWith(SCOPE)) return;

      const current = selected.get(withoutExt);
      if (!current || extensionIndex < current.priority) {
        selected.set(withoutExt, {
          file: absolutePath,
          priority: extensionIndex,
        });
      }
    });

    selected.forEach((value, key) => {
      input[key] = value.file;
    });
  });

  return input;
}

module.exports = defineConfig({
  publicDir: false,
  build: {
    outDir: TARGETS[TARGET].outDir,
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: buildInputMap(),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'scripts/chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
