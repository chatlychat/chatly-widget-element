/**
 * `initOptionsFor` — the options the widget's own `init` gets: ours, minus
 * this package's own extras.
 *
 * Split out of `embed.ts` at the 650-line ceiling. It is pure, it is the one
 * place the embed/widget option boundary is decided, and `reconcile`'s
 * change comparison depends on exactly what it strips — so it is worth being
 * a file somebody can open rather than a helper in the middle of one.
 */
import type { ChatlyEmbedOptions, ChatlyInitOptions } from './types.js';

/** The options the widget's own `init` gets — ours, minus our own extras. */
export function initOptionsFor(options: ChatlyEmbedOptions): ChatlyInitOptions {
  // `loaderUrl`, `lazy`, `nonce`, `locale`, `identity` and `identityEndpoint`
  // are this package's, not the widget's — stripped rather than ignored,
  // because the widget drops unknown options silently and a leaked `lazy`
  // would look like a setting that works.
  //
  // Stripping the two identity keys does a second job `reconcile`'s
  // comparison depends on: `identity` is a FUNCTION, and an inline
  // `identity={async () => …}` arrow is new on every React render, so left in
  // it would re-initialise the widget on every commit and close the visitor's
  // panel mid-sentence. The loop handles a changed provider by refreshing.
  const {
    loaderUrl: _loaderUrl,
    lazy: _lazy,
    nonce: _nonce,
    locale: _locale,
    identity: _identity,
    identityEndpoint: _identityEndpoint,
    visitor,
    ...init
  } = options;
  // `visitor: null` is THIS package's "signed out" (see `startIdentity`) and
  // not a widget option: the widget's `init` takes an identity or no key at
  // all, and an empty one would name nobody while looking like somebody.
  return visitor === undefined || visitor === null ? init : { ...init, visitor };
}
