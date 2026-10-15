// Track the visible window, including the on-screen keyboard and browser zoom.
export const trackVisibleViewport = () => {
  const viewport = window.visualViewport;
  const update = () => {
    const style = document.documentElement.style;
    style.setProperty('--visible-width', `${viewport?.width ?? window.innerWidth}px`);
    style.setProperty('--visible-height', `${viewport?.height ?? window.innerHeight}px`);
    style.setProperty('--visible-left', `${viewport?.offsetLeft ?? 0}px`);
    style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`);
  };
  update();
  window.addEventListener('resize', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
};
