let lastToken = null;

function applyCssUpdate(pathname) {
  if (!pathname) return;

  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    const matchesPath = url.pathname === pathname || url.pathname.endsWith(pathname);
    if (!matchesPath) return;

    url.searchParams.set('v', String(Date.now()));
    link.setAttribute('href', `${url.pathname}?${url.searchParams.toString()}`);
  });
}

async function pollHmrState() {
  try {
    const response = await fetch(`/tools/__aem_hmr_state?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;

    const state = await response.json();
    if (!state || typeof state.token !== 'number') return;
    if (lastToken == null) {
      lastToken = state.token;
      return;
    }
    if (state.token === lastToken) return;
    lastToken = state.token;

    if (state.type === 'css') {
      applyCssUpdate(state.path);
      return;
    }

    window.location.reload();
  } catch {
    // ignore polling errors during startup/restart
  }
}

window.setInterval(pollHmrState, 700);
