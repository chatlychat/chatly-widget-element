/**
 * The one element this package puts on a customer's page.
 *
 * Lifted out of `embed.ts`, which this repo's 650-line ceiling
 * (`scripts/check-file-size.mjs`) caught at 659 when the CSP nonce landed in
 * it — the same reason `conflict-warning.ts` and `lazy.ts` are their own
 * modules. It is a self-contained concern with one caller: a single `<script>`
 * tag, injected at most once per document, carrying the nonce the host page
 * gave us.
 *
 * `embed.ts` owns the mounted widget's lifecycle; this owns the script tag
 * that makes a widget possible at all.
 */
import { applyNonce } from './nonce.js';

/** True once THIS module injected a loader script, so it never injects twice. */
let injectedLoader = false;

/** Whether this module has already put a loader script on the page. */
export function loaderInjected(): boolean {
  return injectedLoader;
}

/** Let the next page (or the test harness) inject again. */
export function resetLoaderInjection(): void {
  injectedLoader = false;
}

export function injectLoader(loaderUrl: string, nonce: string | undefined): void {
  injectedLoader = true;
  /*
   * The DOM is the real source of truth, not `injectedLoader`.
   *
   * A dev-server hot reload re-evaluates this module — resetting the flag —
   * while the page keeps the script tag it already appended. Checking the
   * marker attribute means a reload does not stack a second loader (and a
   * second bundle fetch) onto a page that already has one.
   */
  if (document.querySelector('script[data-chatly-loader]') !== null) {
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = loaderUrl;
  script.setAttribute('data-chatly-loader', '');
  /*
   * Before `appendChild`, not after.
   *
   * The CSP check runs when the element is INSERTED — the "prepare the script
   * element" steps — so a nonce assigned afterwards is one the browser never
   * saw, and it is already too late to change the verdict. The resulting DOM
   * is identical either way, which is why `embed.spec.ts` asserts on the
   * ordering rather than on the end state.
   */
  applyNonce(script, nonce);
  script.onerror = (): void => {
    // The loader has the same message for the bundle it fetches. A script that
    // never loads is otherwise completely silent: an ad blocker, a CSP missing
    // the widget origin, or a typo'd `loaderUrl` all produce an empty page
    // corner and an empty console.
    console.warn(`[Chatly] widget loader failed to load from ${loaderUrl}`);
  };
  document.head.appendChild(script);
}
