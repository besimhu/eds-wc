# Your Project's Title...
Your project's description...

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Vite build pipeline for EDS

The project keeps Adobe EDS runtime contracts (`blocks/*/*.js` and `*.css`) but can now compile source assets through Vite first.
Source-first preference:
- JavaScript modules: use `*.ts` (preferred) or `*.js`
- Stylesheets: use `*.scss` (preferred) or `*.css`

If both source and runtime files exist with the same basename (for example `hero.ts` + `hero.js`), Vite uses the source file and emits runtime-compatible output.

See [VITE-HMR.md](./VITE-HMR.md) for architecture notes, tradeoffs, and future path toward official Vite HMR semantics.

### Local development

1. Run AEM CLI + Vite watch together:

```sh
npm run dev
```

2. Open `http://localhost:5173` for development (Vite proxy with HMR).
3. Vite proxies HTML/content requests to AEM (`http://localhost:3000` by default) and injects HMR.
4. The AEM CLI server is started with `--no-livereload` so only Vite websocket reload is active.
5. Runtime `.js/.css` requests are source-mapped to local `.ts/.scss` files when present, so edits update immediately.
6. Use `npm run build:eds` when you want to apply compiled output back to `blocks/`, `scripts/`, and `styles`.
7. `.scss` changes update linked stylesheets in-place (cache-busted link swap) without full-page reload.

Optional environment variables:

```sh
# if AEM runs on a different host/port
AEM_ORIGIN=http://localhost:3000 npm run dev:vite

# if you want a different Vite proxy port
VITE_PORT=5174 npm run dev:vite
```

### Build commands

```sh
# compile into .vite-build only
npm run build:vite

# compile and apply compiled files to EDS runtime folders
npm run build:eds

# from any block/style/scripts folder, build only that folder scope
npm run build:here
```

### HMR note

This setup provides HMR/full-reload through Vite while using AEM content as the page source via proxying.

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
