# Vite + EDS Live Update Notes

This project currently uses a **custom live-update approach** over AEM/EDS content, not pure Vite HMR semantics.

## Current behavior

- Run `npm run dev`:
  - `aem up` serves content on `http://localhost:3000`
  - custom Vite proxy serves development on `http://localhost:5173`
- HTML is proxied from AEM and augmented with a nonce-safe local client script.
- `.scss` changes:
  - served as compiled CSS at matching `.css` URLs
  - stylesheet links are cache-busted in place (no full-page reload)
- `.ts` / `.js` changes:
  - trigger full page reload

## Why this differs from official Vite HMR

Official Vite HMR expects Vite-managed HTML/module graph and `@vite/client` semantics.
EDS pages are AEM-proxied with CSP constraints (nonce + `strict-dynamic`), so we use a safer compatibility layer.

In short:
- Current setup = **live update optimized for EDS compatibility**
- Official Vite HMR = **module-level hot replacement via Vite client and graph**

## CSP considerations

If updates seem broken in one browser profile but work in incognito/firefox, clear:

1. service workers for `localhost`
2. site storage/cache
3. old tabs still holding stale injected scripts

Open only `http://localhost:5173` for this workflow.

## Known tradeoffs

- CSS updates are near-instant, but not through native Vite CSS HMR pipeline.
- Script updates reload the page rather than replacing modules in place.
- Behavior depends on proxy/client script injection staying CSP-compliant.

## If you want to revisit official Vite HMR semantics later

The most likely path is a larger architecture change:

1. Serve top-level HTML through Vite (or a Vite-first shell).
2. Keep AEM content as proxied data/partials instead of raw final HTML.
3. Ensure CSP allows Vite dev client in development mode.
4. Move block runtime loading into a Vite-managed module graph.

That is a different dev model than standard EDS authoring proxy flow, so it should be treated as a separate initiative.

## Practical recommendation

For this repo and EDS conventions, keep this current approach unless the team explicitly decides to invest in a Vite-first dev architecture.
