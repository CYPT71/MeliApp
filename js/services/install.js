export const createInstallService = () => {
  let deferredPrompt = null;
  let initialized = false;

  const init = ({ onAvailable, onInstalled } = {}) => {
    if (initialized) return;
    initialized = true;
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      onAvailable?.();
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      onInstalled?.();
    });
  };

  const prompt = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    const accepted = choice?.outcome === "accepted";
    if (accepted) deferredPrompt = null;
    return accepted;
  };

  return {
    init,
    prompt,
    isIos: () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window),
    isInstalled: () => window.matchMedia?.("(display-mode: standalone)")?.matches === true || navigator.standalone === true
  };
};
