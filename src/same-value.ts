/**
 * Did the host page actually ask for something different?
 *
 * Every `<chatly-widget>` attribute change and every React re-render arrives
 * here, and the answer decides whether the widget is re-initialised — which
 * destroys and remounts it, closing an open panel. So "the same options
 * spelled differently" has to compare equal.
 *
 * Lifted out of `embed.ts` when that file went over the repo's 650-line
 * ceiling. Pure functions over plain values, which is why they were the right
 * thing to move: nothing here touches the embed's mount state.
 */
import type { ChatlyInitOptions } from './types.js';

/**
 * Structural equality, with named exceptions.
 *
 * `JSON.stringify` was the obvious implementation and is wrong twice: key
 * order differs between two literals with the same contents (so every render
 * would look like a change), and `mountTo` can be an Element, which
 * stringifies to `{}` — making two different containers compare equal and a
 * moved mount point silently ignored.
 */
export function sameOptions(
  a: ChatlyInitOptions,
  b: ChatlyInitOptions,
  ignore: readonly string[] = [],
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !ignore.includes(k)));
  for (const key of keys) {
    // Through `unknown`: an interface with named optional keys does not
    // overlap an index signature, and TypeScript is right to say so — the
    // read below is deliberately dynamic.
    const left = (a as unknown as Record<string, unknown>)[key];
    const right = (b as unknown as Record<string, unknown>)[key];
    if (!sameValue(left, right)) {
      return false;
    }
  }
  return true;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  // An absent key and an explicit `undefined` are the same request. React
  // props produce both for the same JSX depending on how they were spread.
  if (a === undefined || b === undefined || a === null || b === null) {
    return false;
  }
  /*
   * Two functions are the SAME request, whatever their identity.
   *
   * Every function-valued option that reaches here is a PROVIDER the widget
   * calls per request, never a value: `visitor.getToken` mints a ~60-second
   * OIDC identity token and `contextTokenProvider` mints a signed-context
   * one. Two providers that mint for the same person are interchangeable —
   * the argument `sameIdentity` in `identity-loop.ts` already makes for
   * `getToken`, which is why that function compares it by presence. The `on*`
   * handlers are in `ChatlyEmbedHandlers` and never reach this comparison, so
   * there is no option here whose function VALUE matters.
   *
   * Comparing them by reference is what the documented form actually cost. An
   * inline `getToken: () => atlas.session.getToken(…)` arrow — the form in
   * `packages/sdk-js/src/widget-identity.ts`'s own example — is a new function
   * on every React render, so `reconcile` saw a changed `visitor` on every
   * commit and dispatched an `identify`, re-minting a token each time. An
   * inline `contextTokenProvider` was worse: it is NOT in `reconcile`'s ignore
   * list, so it re-initialised the widget on every render, which destroys and
   * remounts it and closes the visitor's panel mid-sentence. That is exactly
   * the hazard `initOptionsFor` strips `identity` for; these two reach the
   * comparison through `visitor` and through the init options instead.
   *
   * PRESENCE still matters: a provider replaced by `undefined` is caught by
   * the `undefined`/`null` arm above and reads as a change, which it is.
   */
  if (typeof a === 'function' && typeof b === 'function') {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  // A DOM node is compared by identity only — recursing into an Element would
  // walk the host page's entire tree. (A function never gets this far: the
  // arm above answers for two of them, and the `typeof` check for one.)
  if (isOpaque(a) || isOpaque(b)) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

function isOpaque(value: object): boolean {
  return typeof Node !== 'undefined' && value instanceof Node;
}
