const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const invokedFrom = process.env.INIT_CWD || ROOT;
const scope = path.relative(ROOT, invokedFrom).replace(/\\/g, '/');

if (scope.startsWith('..')) {
  throw new Error('build:here must be run from inside the project workspace.');
}

const normalizedScope = scope === '' ? '' : scope.replace(/^\/+|\/+$/g, '');
const env = { ...process.env };
if (normalizedScope) {
  env.VITE_SCOPE = normalizedScope;
}

// eslint-disable-next-line no-console
console.log(`Running scoped EDS build for: ${normalizedScope || '(project root)'}`);
execSync('npm run build:eds:scoped', {
  cwd: ROOT,
  env,
  stdio: 'inherit',
});
