const fs = require('fs');
const path = require('path');
const sass = require('sass');
const { createServer } = require('vite');

const ROOT = process.cwd();
const AEM_ORIGIN = process.env.AEM_ORIGIN || 'http://localhost:3000';
const VITE_PORT = Number.parseInt(process.env.VITE_PORT || '5173', 10);
const hmrState = {
  token: Date.now(),
  path: null,
  type: null,
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const REQUEST_HEADERS_TO_DROP = new Set([
  'host',
  'origin',
]);
const RESPONSE_HEADERS_TO_DROP = new Set([
  'content-length',
  'content-encoding',
  'etag',
]);

/**
 * @param {string} requestPath
 * @returns {boolean}
 */
function isLikelyHtmlPath(requestPath) {
  if (requestPath.endsWith('.html') || requestPath.endsWith('.htm')) return true;
  if (requestPath.endsWith('/')) return true;

  const extension = path.extname(requestPath);
  return extension === '';
}

/**
 * @param {string} requestPath
 * @returns {boolean}
 */
function shouldBypassProxy(requestPath) {
  return requestPath.startsWith('/@vite')
    || requestPath.startsWith('/@fs')
    || requestPath.startsWith('/node_modules')
    || requestPath.startsWith('/__vite_ping')
    || requestPath.startsWith('/.well-known/appspecific/com.chrome.devtools.json');
}

/**
 * Rewrites runtime asset URLs to source-first equivalents when they exist.
 * Example: /blocks/hero/hero.js -> /blocks/hero/hero.ts
 * @param {string} requestPath
 * @returns {string}
 */
function mapToPreferredSource(requestPath) {
  const [pathname] = requestPath.split('?');
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/+/, '');
  if (!relativePath) return requestPath;

  const maybeRewrite = (fromExt, toExt) => {
    if (!relativePath.endsWith(fromExt)) return null;

    const preferred = relativePath.slice(0, -fromExt.length) + toExt;
    const preferredAbsolute = path.resolve(ROOT, preferred);
    if (!preferredAbsolute.startsWith(ROOT)) return null;
    if (!fs.existsSync(preferredAbsolute)) return null;
    if (!fs.statSync(preferredAbsolute).isFile()) return null;
    return `/${preferred}`;
  };

  return maybeRewrite('.js', '.ts') || requestPath;
}

/**
 * Resolves a matching SCSS source for a runtime CSS request.
 * Example: /blocks/hero/hero.css -> /blocks/hero/hero.scss
 * @param {string} requestPath
 * @returns {string | null}
 */
function resolveScssForCssRequest(requestPath) {
  const [pathname] = requestPath.split('?');
  const decodedPath = decodeURIComponent(pathname);
  if (!decodedPath.endsWith('.css')) return null;

  const relativePath = decodedPath.replace(/^\/+/, '');
  if (!relativePath) return null;

  const scssRelativePath = relativePath.slice(0, -'.css'.length) + '.scss';
  const scssAbsolutePath = path.resolve(ROOT, scssRelativePath);
  if (!scssAbsolutePath.startsWith(ROOT)) return null;
  if (!fs.existsSync(scssAbsolutePath)) return null;
  if (!fs.statSync(scssAbsolutePath).isFile()) return null;

  return scssAbsolutePath;
}

/**
 * @param {string} requestPath
 * @returns {boolean}
 */
function fileExistsInWorkspace(requestPath) {
  const relativePath = decodeURIComponent(requestPath.split('?')[0]).replace(/^\/+/, '');
  if (!relativePath) return false;

  const localPath = path.resolve(ROOT, relativePath);
  if (!localPath.startsWith(ROOT)) return false;
  if (!fs.existsSync(localPath)) return false;

  return fs.statSync(localPath).isFile();
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function getTargetUrl(req) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  return `${AEM_ORIGIN}${requestUrl.pathname}${requestUrl.search}`;
}

/**
 * @param {import('http').IncomingMessage['headers']} headers
 * @returns {Record<string, string>}
 */
function sanitizeRequestHeaders(headers) {
  const result = {};

  Object.entries(headers).forEach(([key, value]) => {
    if (value == null) return;
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (REQUEST_HEADERS_TO_DROP.has(key.toLowerCase())) return;
    result[key] = Array.isArray(value) ? value.join(', ') : String(value);
  });

  return result;
}

/**
 * @param {Headers} headers
 * @returns {Record<string, string>}
 */
function sanitizeResponseHeaders(headers) {
  const result = {};
  headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) return;
    result[key] = value;
  });
  return result;
}

/**
 * Removes AEM CLI livereload script from proxied HTML.
 * Vite HMR handles reloads for the proxy dev experience.
 * @param {string} html
 * @returns {string}
 */
function stripAemLiveReload(html) {
  let next = html.replace(/<script[^>]*livereload[^>]*>\s*<\/script>/gi, '');
  next = next.replace(/<script[^>]*>[\s\S]*?livereload[\s\S]*?<\/script>/gi, '');
  next = next.replace(/<script[^>]*src=["'][^"']*\/livereload[^"']*["'][^>]*>\s*<\/script>/gi, '');
  return next;
}

/**
 * Injects a small Vite-aware client helper once per HTML document.
 * @param {string} html
 * @returns {string}
 */
function injectViteAemClient(html) {
  if (html.includes('/tools/vite-aem-client.js')) return html;
  const nonceMatch = html.match(/<script[^>]*nonce=["']([^"']+)["'][^>]*>/i);
  const nonceAttr = nonceMatch ? ` nonce="${nonceMatch[1]}"` : '';
  const scriptTag = `<script${nonceAttr} src="/tools/vite-aem-client.js"></script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${scriptTag}</body>`);
  return `${html}\n${scriptTag}`;
}

/**
 * @param {string} absolutePath
 * @returns {string}
 */
function toRequestPath(absolutePath) {
  const relative = path.relative(ROOT, absolutePath).replace(/\\/g, '/');
  return `/${relative}`;
}

/**
 * Serves a file as-is with the provided content type.
 * @param {import('http').ServerResponse} res
 * @param {string} absolutePath
 * @param {string} contentType
 * @param {'GET'|'HEAD'} method
 */
function serveRawFile(res, absolutePath, contentType, method) {
  const body = fs.readFileSync(absolutePath);
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

/**
 * @param {import('vite').ViteDevServer} server
 */
function registerAemProxyMiddleware(server) {
  const middleware = async (req, res, next) => {
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      next();
      return;
    }

    req.url = mapToPreferredSource(req.url || '/');

    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const { pathname } = requestUrl;

    if (pathname === '/tools/__aem_hmr_state') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(hmrState));
      return;
    }

    if (shouldBypassProxy(pathname)) {
      next();
      return;
    }

    if (pathname === '/tools/vite-aem-client.js') {
      const clientPath = path.join(ROOT, 'tools/vite-aem-client.js');
      if (fs.existsSync(clientPath)) {
        serveRawFile(res, clientPath, 'text/javascript; charset=utf-8', method);
        return;
      }
    }

    const scssSourcePath = resolveScssForCssRequest(req.url || '/');
    if (scssSourcePath) {
      try {
        const result = sass.compile(scssSourcePath, {
          style: 'expanded',
          loadPaths: [ROOT, path.dirname(scssSourcePath)],
        });
        res.writeHead(200, {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': 'no-store',
        });
        if (method === 'HEAD') {
          res.end();
          return;
        }
        res.end(result.css);
        return;
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`SCSS compile error for ${pathname}\n${error.message}`);
        return;
      }
    }

    if (pathname.endsWith('.css') && fileExistsInWorkspace(pathname)) {
      const cssPath = path.join(ROOT, pathname.replace(/^\/+/, ''));
      serveRawFile(res, cssPath, 'text/css; charset=utf-8', method);
      return;
    }

    if (pathname.endsWith('.js') && fileExistsInWorkspace(pathname)) {
      const jsPath = path.join(ROOT, pathname.replace(/^\/+/, ''));
      serveRawFile(res, jsPath, 'text/javascript; charset=utf-8', method);
      return;
    }

    // Let Vite serve local code/assets first when file exists in the workspace.
    if (fileExistsInWorkspace(pathname)) {
      next();
      return;
    }

    try {
      const upstreamResponse = await fetch(getTargetUrl(req), {
        method,
        headers: sanitizeRequestHeaders(req.headers),
      });
      if (upstreamResponse.status >= 400) {
        // eslint-disable-next-line no-console
        console.warn(`AEM proxy returned ${upstreamResponse.status} for ${pathname}`);
      }

      const contentType = upstreamResponse.headers.get('content-type') || '';
      const isHtml = isLikelyHtmlPath(pathname) || contentType.includes('text/html');

      if (isHtml) {
        const html = await upstreamResponse.text();
        const withoutAemLiveReload = stripAemLiveReload(html);
        const withViteAemClient = injectViteAemClient(withoutAemLiveReload);
        const headers = sanitizeResponseHeaders(upstreamResponse.headers);
        headers['content-type'] = 'text/html; charset=utf-8';

        res.writeHead(upstreamResponse.status, headers);
        res.end(withViteAemClient);
        return;
      }

      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      const headers = sanitizeResponseHeaders(upstreamResponse.headers);
      res.writeHead(upstreamResponse.status, headers);

      if (method === 'HEAD') {
        res.end();
        return;
      }

      res.end(body);
    } catch (error) {
      next(error);
    }
  };

  // Ensure this runs before Vite's default static/css middlewares.
  server.middlewares.stack.unshift({
    route: '',
    handle: middleware,
  });
}

(async () => {
  const server = await createServer({
    root: ROOT,
    appType: 'custom',
    server: {
      port: VITE_PORT,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 120,
        ignored: ['**/.git/**', '**/.vite-build/**', '**/node_modules/**'],
      },
    },
    plugins: [
      {
        name: 'aem-hmr-reload',
        configureServer(viteServer) {
          viteServer.watcher.add([
            path.join(ROOT, 'blocks/**/*.scss'),
            path.join(ROOT, 'styles/**/*.scss'),
            path.join(ROOT, 'blocks/**/*.css'),
            path.join(ROOT, 'styles/**/*.css'),
            path.join(ROOT, 'blocks/**/*.ts'),
            path.join(ROOT, 'scripts/**/*.ts'),
            path.join(ROOT, 'blocks/**/*.js'),
            path.join(ROOT, 'scripts/**/*.js'),
          ]);

          const triggerReload = (file) => {
            const localPath = file.replace(/\\/g, '/');
            const inManagedFolders = /\/(blocks|styles|scripts)\//.test(localPath);
            if (!inManagedFolders) return;

            if (localPath.endsWith('.scss') || localPath.endsWith('.css')) {
              const cssPath = localPath.endsWith('.scss')
                ? localPath.replace(/\.scss$/, '.css')
                : localPath;
              hmrState.token = Date.now();
              hmrState.path = toRequestPath(cssPath);
              hmrState.type = 'css';
              viteServer.ws.send({
                type: 'custom',
                event: 'aem:css-update',
                data: { path: hmrState.path },
              });
              return;
            }

            if (localPath.endsWith('.js') || localPath.endsWith('.ts')) {
              hmrState.token = Date.now();
              hmrState.path = toRequestPath(localPath);
              hmrState.type = 'script';
              viteServer.ws.send({ type: 'full-reload', path: '*' });
            }
          };

          viteServer.watcher.on('change', triggerReload);
          viteServer.watcher.on('add', triggerReload);
          viteServer.watcher.on('unlink', triggerReload);
        },
      },
    ],
  });

  registerAemProxyMiddleware(server);

  await server.listen();
  const url = `http://localhost:${VITE_PORT}`;
  // eslint-disable-next-line no-console
  console.log(`Vite HMR proxy is running at ${url} (AEM origin: ${AEM_ORIGIN})`);
})();
