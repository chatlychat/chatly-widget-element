/**
 * The stand-in launcher lazy mode paints before the bundle exists.
 *
 * Split out of `lazy.ts` at the 650-line ceiling. It is the honest seam:
 * everything here is about drawing one button and nothing here decides WHEN
 * to load — `lazy.ts` keeps the triggers, this file keeps the pixels.
 *
 * The one thing to know before editing: any lazy scheme that shows NOTHING
 * until the bundle lands is not an optimisation, it is a broken chat widget.
 * The corner is empty, the visitor who wanted help cannot ask for it, and
 * nothing in any console says why. So this draws a real, clickable,
 * keyboard-reachable launcher first and fetches the bundle on demand.
 */

/** The subset of `WidgetTheme` the placeholder launcher mirrors. */
export interface PlaceholderTheme {
  primaryColor: string;
  primaryContrast: string;
  launcherSize: number;
  position: 'left' | 'right';
  offsetX: number;
  offsetY: number;
  launcherImage: string | undefined;
}

/**
 * The placeholder's look, defaulted to the widget's own defaults.
 *
 * Every fallback here is copied from where the widget sets it —
 * `apps/widget/src/widget/shared.ts` for the colours and the launcher size,
 * `apps/widget/src/index.ts` for the corner and the offsets. They are copied
 * rather than imported because the loader is a standalone 2KB artifact that
 * must not pull in the bundle it exists to defer. A drift makes the swap from
 * placeholder to real launcher visibly jump; it cannot break the chat.
 */
export function placeholderTheme(theme: Record<string, unknown>): PlaceholderTheme {
  const size = theme['launcherSize'];
  const offsetX = theme['offsetX'];
  const offsetY = theme['offsetY'];
  const image = theme['launcherImage'];
  return {
    primaryColor: typeof theme['primaryColor'] === 'string' ? theme['primaryColor'] : '#2563eb',
    primaryContrast:
      typeof theme['primaryContrast'] === 'string' ? theme['primaryContrast'] : '#ffffff',
    launcherSize: typeof size === 'number' && size > 0 ? size : 56,
    position: theme['position'] === 'left' ? 'left' : 'right',
    offsetX: typeof offsetX === 'number' ? offsetX : 16,
    offsetY: typeof offsetY === 'number' ? offsetY : 16,
    launcherImage: typeof image === 'string' ? image : undefined,
  };
}

/** Marks the host element, so a second loader instance cannot draw a second one. */
const PLACEHOLDER_ATTRIBUTE = 'data-chatly-placeholder';

/**
 * The stand-in launcher.
 *
 * ── Why a shadow root ──────────────────────────────────────────────────
 *
 * The same reason the widget uses one: the host page's cascade must not reach
 * in. A customer with `button { width: 100% }` in their reset would otherwise
 * get a full-width blue bar in the corner of every page — and they would see
 * it only in lazy mode, which makes it look like lazy mode is broken rather
 * than like a style collision.
 *
 * ── Why a real `<button>` ──────────────────────────────────────────────
 *
 * Enter, Space, focus ring, `role`, and the tab order all come free, and
 * CLAUDE.md §4 requires every interactive element to be keyboard-reachable.
 * A `<div onclick>` would have been a launcher a keyboard visitor cannot use
 * for as long as the bundle is deferred — which is forever if they never
 * touch a pointer.
 *
 * `launcherIcon` is deliberately NOT mirrored: the widget renders it as raw
 * HTML, and doing that in the loader — the one script on every customer page
 * — to save a 150ms icon swap is a trade in the wrong direction.
 * `launcherImage` IS mirrored, escaped the same way the widget escapes it.
 *
 * `nonce` is a PARAMETER rather than a module read, and that is what made
 * this file shareable. It used to import `loaderNonce` — a module-level
 * `const` that reads `document.currentScript`, which is non-null only during
 * the loader's own classic-script execution. Imported into
 * `@chatlychat/widget-element`, that const evaluates when the SITE's bundle
 * is parsed, long before `startWidget` publishes a nonce, so it would have
 * been `undefined` on every npm-embedded page with a strict CSP: the
 * stand-in launcher's `<style>` refused, the button drawn with no styling at
 * all. A silent, CSP-only, npm-only regression — exactly the shape this repo
 * keeps finding late.
 */
export function drawPlaceholder(
  theme: PlaceholderTheme,
  on: { prefetch: () => void; activate: () => void },
  nonce?: string,
): () => void {
  if (document.querySelector(`[${PLACEHOLDER_ATTRIBUTE}]`) !== null) {
    return () => undefined;
  }
  const host = document.createElement('div');
  host.setAttribute(PLACEHOLDER_ATTRIBUTE, '');
  // Mirrors the real host element in `apps/widget/src/index.ts`, including the
  // z-index, so the swap does not move the button by a pixel.
  host.style.cssText =
    `all: initial; position: fixed; z-index: 2147483640; ` +
    `bottom: ${String(theme.offsetY)}px; ${theme.position}: ${String(theme.offsetX)}px;`;

  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const size = `${String(theme.launcherSize)}px`;
  style.textContent =
    `button{width:${size};height:${size};border-radius:999px;border:0;` +
    `background:${theme.primaryColor};color:${theme.primaryContrast};display:flex;` +
    `align-items:center;justify-content:center;cursor:pointer;padding:0;` +
    `box-shadow:0 10px 30px rgba(15,23,42,.18),0 4px 10px rgba(15,23,42,.1);` +
    `transition:transform .18s ease}button:hover{transform:translateY(-1px)}` +
    `button:active{transform:translateY(0)}`;
  /*
   * Stamped BEFORE `appendChild`, because the CSP check runs on INSERTION: a
   * nonce set afterwards is invisible to the browser, and the element is
   * refused while every test that reads it back still passes.
   *
   * Through the `nonce` IDL property and never `setAttribute`. HTML BLANKS
   * the `nonce` content attribute on any element once it is connected under
   * a header-delivered policy, so `getAttribute('nonce')` returns `''` on a
   * real page while passing under a `<meta>` policy and in jsdom.
   */
  if (nonce !== undefined) {
    style.nonce = nonce;
  }
  root.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  // The same label the real launcher carries when closed, so a screen reader
  // hears one name across the swap.
  button.setAttribute('aria-label', 'Open chat');
  if (theme.launcherImage === undefined) {
    // The widget's own closed-state icon, at the same size.
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  } else {
    // `JSON.stringify(...).slice(1, -1)` is how the widget escapes this exact
    // value into a `url()`; copied so the two cannot disagree about a quote.
    button.style.backgroundImage = `url(${JSON.stringify(theme.launcherImage).slice(1, -1)})`;
    button.style.backgroundSize = 'cover';
    button.style.backgroundPosition = 'center';
  }

  button.addEventListener('pointerenter', on.prefetch);
  button.addEventListener('focus', on.prefetch);
  button.addEventListener('click', on.activate);
  root.appendChild(button);
  document.body.appendChild(host);

  return () => host.remove();
}
