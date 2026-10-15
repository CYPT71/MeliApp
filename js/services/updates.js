export const createUpdateService = ({ beforeReload, onError, host = document.body }) => {
  let registration;
  let available = false;
  let reloading = false;
  let banner;
  let checking = false;
  const currentVersion = document.querySelector('meta[name="app-version"]')?.content;
  const showUpdate = () => {
    available = true;
    if (banner) return;
    banner = document.createElement('aside');
    banner.className = 'update-banner';
    banner.setAttribute('aria-label', 'Mise à jour de MeliApp');
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = 'Une nouvelle version est prête. Tes données et brouillons seront conservés.';
    const update = document.createElement('button');
    update.className = 'primary';
    update.textContent = 'Mettre à jour';
    update.addEventListener('click', async () => {
      update.disabled = true;
      try {
        await beforeReload();
        // Install the complete new shell before switching the active worker.
        await registration?.update();
        if (registration?.installing) {
          await new Promise((resolve, reject) => {
            const worker = registration.installing;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed') resolve();
              if (worker.state === 'redundant') reject(new Error('La mise à jour n’a pas pu être installée.'));
            });
          });
        }
        await beforeReload();
        if (registration?.waiting) {
          reloading = true;
          registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
        } else window.location.reload();
      } catch (error) {
        update.disabled = false;
        message.textContent = 'Actualisation annulée : vérifie ta connexion et la sauvegarde de tes données.';
        onError?.(error);
      }
    });
    const later = document.createElement('button');
    later.textContent = 'Plus tard';
    later.addEventListener('click', () => { banner.remove(); banner = null; });
    banner.append(message, update, later);
    host.append(banner);
  };
  const watch = () => {
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
  };
  const check = async () => {
    if (checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
    checking = true;
    try {
      await registration?.update();
      const response = await fetch(new URL('./version.json', document.baseURI), { cache: 'no-store' });
      if (response.ok && response.headers.get('content-type')?.includes('json')) {
        const version = await response.json();
        if (currentVersion && version.version && version.version !== currentVersion) showUpdate();
      }
    } catch { /* Offline use remains available; retry on the next resume. */ }
    finally { checking = false; }
  };
  return {
    async start() {
      if ('serviceWorker' in navigator) {
        try {
          registration = await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
          watch();
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading) window.location.reload();
          });
        } catch { /* The app also works in browsers without service workers. */ }
      }
      await check();
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
      window.setInterval(check, 5 * 60 * 1000);
    },
    check,
    get available() { return available; }
  };
};
