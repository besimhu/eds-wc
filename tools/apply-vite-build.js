const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SCOPE = (process.env.VITE_SCOPE || '').replace(/^\/+|\/+$/g, '');
const COPY_TARGETS = [
  { from: '.vite-build/js/blocks', to: 'blocks' },
  { from: '.vite-build/js/scripts', to: 'scripts' },
  { from: '.vite-build/css/blocks', to: 'blocks' },
  { from: '.vite-build/css/styles', to: 'styles' },
];

/**
 * @param {string} relativePath
 */
function removeIfExists(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  fs.rmSync(absolutePath, { recursive: true, force: true });
}

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function collectFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const files = [];
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
  dirents.forEach((dirent) => {
    const absolutePath = path.join(dirPath, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      return;
    }
    files.push(absolutePath);
  });

  return files;
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function hasMatchingSource(relativePath) {
  const extension = path.extname(relativePath);
  const withoutExt = relativePath.slice(0, -extension.length);

  if (extension === '.js') {
    return fs.existsSync(path.join(ROOT, `${withoutExt}.ts`));
  }
  if (extension === '.css') {
    return fs.existsSync(path.join(ROOT, `${withoutExt}.scss`));
  }

  return false;
}

/**
 * @returns {boolean}
 */
function hasTsSourceInScripts() {
  const scriptsRoot = path.join(ROOT, 'scripts');
  const files = collectFiles(scriptsRoot);
  return files.some((filePath) => filePath.endsWith('.ts'));
}

let copiedFiles = 0;
const shouldCopyScriptChunks = hasTsSourceInScripts();

COPY_TARGETS.forEach(({ from, to }) => {
  const fromAbsolute = path.join(ROOT, from);
  if (!fs.existsSync(fromAbsolute)) return;

  const files = collectFiles(fromAbsolute);
  files.forEach((filePath) => {
    const relativeFromSource = path.relative(fromAbsolute, filePath).replace(/\\/g, '/');
    const destinationRelative = path.join(to, relativeFromSource).replace(/\\/g, '/');

    const isChunk = destinationRelative.startsWith('scripts/chunks/');
    if (isChunk && !shouldCopyScriptChunks) return;
    if (!isChunk && !hasMatchingSource(destinationRelative)) return;
    if (SCOPE && !destinationRelative.startsWith(SCOPE)) return;

    const destinationAbsolute = path.join(ROOT, destinationRelative);
    fs.mkdirSync(path.dirname(destinationAbsolute), { recursive: true });
    fs.copyFileSync(filePath, destinationAbsolute);
    copiedFiles += 1;
  });
});

if (shouldCopyScriptChunks) {
  // If scripts TS output generated chunks, replace previous chunk directory.
  const chunkOutputDir = path.join(ROOT, '.vite-build/js/scripts/chunks');
  if (fs.existsSync(chunkOutputDir)) {
    removeIfExists('scripts/chunks');
    fs.cpSync(chunkOutputDir, path.join(ROOT, 'scripts/chunks'), { recursive: true, force: true });
  }
}

if (copiedFiles === 0) {
  // eslint-disable-next-line no-console
  console.log('No compiled files were applied (no matching .ts/.scss sources in scope).');
} else {
  // eslint-disable-next-line no-console
  console.log(`Applied ${copiedFiles} compiled files to EDS runtime folders.`);
}
