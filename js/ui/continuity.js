// Keep keyboard context and unfinished quick-entry fields across state renders.
const contexts = new WeakMap();

const identity = element => element && ({
  tag: element.tagName,
  feature: element.closest('[data-feature]')?.dataset.feature,
  name: element.getAttribute('name'),
  action: element.dataset.action,
  id: element.dataset.id,
  key: element.dataset.key,
  type: element.getAttribute('type'),
  value: element.matches('input[type="radio"]') ? element.value : undefined
});
const find = (root, key) => key && [...root.querySelectorAll(key.tag)].find(element => {
  const candidate = identity(element);
  return Object.keys(key).every(name => candidate[name] === key[name]);
});

export const captureContinuity = (root, route, event) => {
  const previous = contexts.get(root);
  const sameRoute = previous?.route === route;
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const focus = sameRoute ? identity(active) : null;
  const selection = active && typeof active.selectionStart === 'number'
    ? [active.selectionStart, active.selectionEnd] : null;
  const quickDraft = sameRoute && event !== 'task:created'
    ? [...new Map([
      ...(previous.quickDraft ?? []).map(field => [JSON.stringify(field.key), field]),
      ...[...root.querySelectorAll('.task-quick-create input, .task-quick-create select')].map(input => {
        const field = { key: identity(input), value: input.value, checked: input.checked };
        return [JSON.stringify(field.key), field];
      })
    ]).values()] : [];
  const navScroll = root.querySelector('.feature-nav')?.scrollLeft ?? 0;
  const hadDialog = !!root.querySelector('dialog');
  const focusedValue = sameRoute && event !== "task:created" && active?.matches('input[type="search"], input[type="text"], input:not([type]), textarea') ? active.value : undefined;
  const context = { route, focus, focusedValue, selection, quickDraft, navScroll, sameRoute, hadDialog,
    returnFocus: previous?.returnFocus };
  contexts.set(root, context);
  return context;
};

export const restoreContinuity = (root, context, dispatch) => {
  for (const { key, value, checked } of context.quickDraft) {
    const input = find(root, key);
    if (input) { input.value = value; input.checked = checked; }
  }
  const nav = root.querySelector('.feature-nav');
  if (nav) {
    nav.scrollLeft = context.navScroll;
    if (!context.sameRoute) {
      const active = nav.querySelector('[aria-current="page"]');
      if (active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }
  const dialog = root.querySelector('dialog.item-inspector');
  if (dialog) {
    if (!context.hadDialog) context.returnFocus = context.focus;
    dialog.showModal();
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dispatch('item-inspector:close');
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dispatch('item-inspector:close');
      }
    });
  }
  const key = context.hadDialog && !dialog ? context.returnFocus : context.focus;
  const replacement = find(root, key);
  if (replacement && (!dialog || dialog.contains(replacement))) {
    if (context.focusedValue !== undefined && key === context.focus) replacement.value = context.focusedValue;
    replacement.focus({ preventScroll: true });
    if (context.selection && typeof replacement.setSelectionRange === 'function' && /^(text|search|url|tel|password)$/.test(replacement.type)) {
      replacement.setSelectionRange(...context.selection);
    }
  }
};
