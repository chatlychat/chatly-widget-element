/**
 * The identity loop — the ~60 lines every integrator wrote by hand (CHT-D10).
 *
 * ═══ WHAT WAS BEING COPIED ════════════════════════════════════════════════
 *
 * Numera, Crossly and Referalli each wrote the same thing, independently:
 *
 *   1. fetch `{externalId, email, name, userHash}` from their own server
 *      route, `cache: 'no-store'`, because a cached identity is somebody
 *      else's identity;
 *   2. remember which account the widget was last identified as, in their
 *      OWN `localStorage` key — `referally_chat_account` in Referalli's case,
 *      which then had to be declared in their privacy policy;
 *   3. `reset()` when the answer is null or names a different account;
 *   4. `identify()` after `ready`.
 *
 * Step 2 is the one worth deleting. The widget already stores the external id
 * it was last verified as, at `chatly:xid:<publicId>` — it is in the public
 * storage manifest (`packages/shared/src/widget-config/storage.ts`) and in the
 * channel's storage declaration, so it is already disclosed. A host key beside
 * it is a second copy of the same fact, with a second privacy-policy line and
 * a second way to go stale.
 *
 * ═══ WHY THIS IS IN `widget-element` AND NOT IN THE WIDGET ════════════════
 *
 * Because of where the bytes are. `apps/widget/dist/widget.js` is paid by
 * EVERY visitor on EVERY page view of every customer site, and it sits ~72
 * bytes under a 44,000-byte gzipped ceiling that has never moved. An identity
 * loop cannot be deferred into a chunk — it has to run before `init` — so it
 * would be 250-400 bytes of first paint for a convenience wrapper, which is
 * not a defensible trade for the visitors who never open the chat.
 *
 * This package has no first-paint budget: it is installed by a bundler, not
 * injected on page load, and it is what the integrators who asked for this
 * actually install (`@chatlychat/widget-react` → `<ChatlyLauncher>`). So the
 * loop lives here and costs the widget bundle zero.
 *
 * The consequence, stated plainly rather than buried: a plain
 * `Chatly('init', { identity })` SNIPPET embed — one that does not go through
 * this package or `@chatlychat/widget-react` — still has to write the loop by
 * hand. `identity` and `identityEndpoint` are options of THIS package.
 *
 * ═══ THE ONE RULE ═════════════════════════════════════════════════════════
 *
 * **Only an explicit `null` signs the visitor out.** Everything else that is
 * not a usable identity — a provider that threw, a route that answered 500, a
 * body with no `identity` key, an answer with no `externalId` — changes
 * NOTHING and warns.
 *
 * That asymmetry is the whole safety argument. `reset()` is destructive: it
 * drops the session, the verified hash, the external id and the unread
 * watermark, so a visitor mid-conversation loses their thread from this
 * browser. An identity route that is briefly down must not do that to every
 * signed-in visitor on the site at once, and "the fetch failed" and "nobody
 * is signed in" are the same value in JavaScript unless something keeps them
 * apart deliberately. `resolve()` below returns `undefined` for the first and
 * `null` for the second, and nothing collapses the two.
 */
import type { ChatlyEmbedOptions, ChatlyIdentity, ChatlyInitOptions } from './types.js';

/**
 * What a provider or an identity route may hand back.
 *
 * Both spellings are accepted because both are what the two documented forms
 * produce. `identityEndpoint` names a route whose contract is
 * `{identity: {…} | null}` — an envelope, so the route can grow a sibling key
 * without becoming ambiguous — and the callback form in the docs is
 * `async () => (await fetch('/api/chatly/identity')).json()`, which is that
 * same envelope. A host whose own function already has the user object hands
 * it over bare.
 *
 * The two cannot be confused: `ChatlyIdentity` has no `identity` member, so an
 * own `identity` key is the envelope and anything else is the identity. (It is
 * a TypeScript "weak type" — every member optional — so the compiler also
 * refuses `{identity: x}` where a bare `ChatlyIdentity` is expected, rather
 * than silently accepting an envelope as an identity with no fields set.)
 */
export type ChatlyIdentityAnswer = ChatlyIdentity | null | { identity: ChatlyIdentity | null };

/**
 * Ask the host page who is signed in.
 *
 * Called at boot, whenever the tab becomes visible again, and on every
 * re-init. It may be async and it may throw or reject — see THE ONE RULE in
 * the header for what happens then, which is nothing.
 */
export type ChatlyIdentityProvider = () =>
  | ChatlyIdentityAnswer
  | Promise<ChatlyIdentityAnswer>
  | undefined;

/** What the loop is allowed to ask the widget to do. */
export type IdentityDispatch = (method: 'identify' | 'reset', identity?: ChatlyIdentity) => void;

/**
 * A running loop.
 *
 * `resolved()` is what makes "called before any re-init" true without a round
 * trip: a re-init carries the last answer the loop GOT rather than the
 * `visitor` prop the host wrote once, and a refresh is kicked off alongside in
 * case it has since changed. Without it, every re-init would drop the widget
 * back to the stale prop for one network round trip.
 */
export interface IdentityLoop {
  /** The last answer, or `undefined` if none has arrived yet. */
  resolved: () => ChatlyIdentity | null | undefined;
  /** Re-read the provider from new options, and refresh if it changed. */
  update: (options: ChatlyEmbedOptions) => void;
  /** Ask again now. Coalesced: a call while one is in flight is a no-op. */
  refresh: () => void;
  /** Remove the `visibilitychange` listener and ignore any answer in flight. */
  stop: () => void;
}

/** The `chatly:xid:<publicId>` key — the widget's own record of who this is. */
function storageKey(publicId: string): string {
  return `chatly:xid:${publicId}`;
}

/**
 * Who the widget was last VERIFIED as on this browser, or null.
 *
 * Guarded because `localStorage` is not a property read: in a private window,
 * on an opaque origin, or with site data blocked, touching it THROWS rather
 * than returning null. A host page must not lose its chat over a browser
 * setting, and a throw here would propagate into whatever called `refresh()`.
 *
 * `null` is the right answer in every failure case, and it is also the safe
 * one: it means "nothing of a previous person is remembered", so the sign-out
 * branch below does not reset a session that was never recorded.
 *
 * Note what this key means and does not mean. The widget writes it only once
 * the SERVER has accepted an identity (`rememberSession` in
 * `apps/widget/src/client-identity.ts`), so a value here is a verified person
 * rather than a claim — which is exactly why it is worth comparing against
 * and why the host's own key never needed to exist.
 *
 * Exported because `embed-identity.ts` asks the same question at MOUNT, where
 * no provider answers it: see `startIdentity` there.
 */
export function storedExternalId(publicId: string): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(publicId));
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

/**
 * The provider this set of options asks for, or null for "no loop".
 *
 * `identity` beats `identityEndpoint` when both are set, and says so: they
 * describe the same thing two ways and silently preferring one is how a host
 * ends up debugging a route that is never called. A callback is the more
 * specific statement — it is code the host wrote — so it wins.
 */
export function identityProviderFor(options: ChatlyEmbedOptions): ChatlyIdentityProvider | null {
  const { identity, identityEndpoint } = options;
  if (typeof identity === 'function') {
    if (typeof identityEndpoint === 'string' && identityEndpoint !== '') {
      console.warn(
        '[Chatly] both identity and identityEndpoint were given. Using identity; ' +
          'identityEndpoint is ignored.',
      );
    }
    return identity;
  }
  if (typeof identityEndpoint === 'string' && identityEndpoint !== '') {
    return () => fetchIdentity(identityEndpoint);
  }
  return null;
}

/**
 * The `identityEndpoint` provider.
 *
 * `cache: 'no-store'` is the whole reason this is not a bare `fetch`: an
 * identity response that a browser, a service worker or a CDN is allowed to
 * reuse is one visitor's account served to the next one on a shared device.
 * The server helper (`chatlyIdentityHandler` in `@chatlychat/sdk-node`) sends
 * `Cache-Control: private, no-store` for the same reason — belt and braces,
 * because only one of the two is under our control on any given deployment.
 *
 * A non-2xx REJECTS rather than returning null. That distinction is THE ONE
 * RULE: a 500 from the host's identity route must not sign every visitor out.
 *
 * `credentials` is left at fetch's default (`same-origin`), which is what a
 * same-origin route needs and what the documented form is. A cross-origin
 * identity route needs `credentials: 'include'` and a CORS policy to match, so
 * it has to use the callback form — where the host writes the `fetch` and owns
 * those decisions.
 */
async function fetchIdentity(endpoint: string): Promise<ChatlyIdentityAnswer> {
  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`[Chatly] identityEndpoint ${endpoint} answered ${String(response.status)}`);
  }
  return (await response.json()) as ChatlyIdentityAnswer;
}

/**
 * One answer, normalised — or `undefined` for "no answer, change nothing".
 *
 * The three refusals, and why each is `undefined` rather than `null`:
 *
 *  - **a body with no `identity` key.** The envelope contract was not met, so
 *    the route is misconfigured or something else answered (a login redirect
 *    serving HTML is the common one, and `response.json()` on that throws
 *    before we get here). Not a statement that nobody is signed in.
 *  - **an identity with no `externalId`.** It is the only field contacts are
 *    matched on, so `{email}` alone would attach that email to whichever
 *    contact this browser's session already holds — a different person's, on
 *    a shared device. An anonymous prefill is what the `visitor` option is
 *    for; this loop is the ACCOUNT loop.
 *  - **anything that is not an object.** A `204` body, a `"ok"`, a number.
 */
export function normalizeAnswer(answer: unknown): ChatlyIdentity | null | undefined {
  if (answer === null) {
    return null;
  }
  if (typeof answer !== 'object') {
    console.warn('[Chatly] the identity provider answered something that is not an object');
    return undefined;
  }
  const envelope = answer as Record<string, unknown>;
  const identity = 'identity' in envelope ? envelope['identity'] : answer;
  if (identity === null) {
    return null;
  }
  if (typeof identity !== 'object') {
    console.warn(
      '[Chatly] the identity provider answered {identity: …} with a value that is neither an ' +
        'object nor null. Nothing changed.',
    );
    return undefined;
  }
  const externalId = (identity as ChatlyIdentity).externalId;
  if (typeof externalId !== 'string' || externalId === '') {
    console.warn(
      '[Chatly] the identity provider answered an identity with no externalId. It is the only ' +
        'field contacts are matched on, so nothing was changed — answer null to sign out.',
    );
    return undefined;
  }
  return identity as ChatlyIdentity;
}

/**
 * Start the loop. Returns null when these options configure no provider.
 *
 * `dispatch` is a parameter rather than an import of `embed.ts`'s, for two
 * reasons. One is structural: `embed.ts` imports this module, so importing
 * back would be a cycle — `controls.ts` avoids the same cycle the same way,
 * and its header says so. The other is that it makes the loop testable
 * without a `window.Chatly` at all, which matters because what these tests
 * must assert is WHAT WAS DISPATCHED. A fake widget that accepts every call
 * agrees with every bug; four mobile SDKs shipped an unusable realtime
 * handshake behind exactly that kind of green suite.
 */
export function startIdentityLoop(
  options: ChatlyEmbedOptions,
  dispatch: IdentityDispatch,
): IdentityLoop | null {
  let provider = identityProviderFor(options);
  if (provider === null) {
    return null;
  }
  const publicId = options.publicId;

  /** The last answer, or `undefined` until one arrives. */
  let last: ChatlyIdentity | null | undefined;
  /**
   * Bumped by `stop()` and by every refresh, so an answer that resolves after
   * a newer request went out — or after the widget was torn down — is dropped
   * instead of applied. Two `visibilitychange` events a few hundred
   * milliseconds apart can genuinely resolve out of order, and applying the
   * older one would identify the visitor as whoever they were a moment ago.
   */
  let generation = 0;
  let inFlight = false;
  let stopped = false;

  const apply = (answer: ChatlyIdentity | null | undefined): void => {
    if (answer === undefined) {
      return;
    }
    if (answer === null) {
      /*
       * Signed out. `reset()` only if something of a person is remembered.
       *
       * On a browser with no stored external id there is nothing to forget,
       * and resetting would throw away the ANONYMOUS session this visitor is
       * using right now — including a conversation they started before
       * signing in, which the widget keeps on purpose so it follows them onto
       * their contact when they do. A signed-out page load would otherwise
       * drop that thread on every visit.
       */
      last = null;
      if (storedExternalId(publicId) !== null) {
        dispatch('reset');
      }
      return;
    }
    /*
     * The same person, already applied, and the widget still agrees. Nothing
     * to do.
     *
     * Both halves are needed. Without the first, `visibilitychange` would POST
     * an identify on every tab focus. Without the second — re-reading the
     * stored id — a `reset()` from somewhere else (the host's own button, a
     * refused session) would leave this loop believing the visitor is still
     * identified and never re-asserting it.
     *
     * `sameIdentity` and not `externalId` equality: a changed email, display
     * name or attribute bag is a real update the host is entitled to push, and
     * it arrives on the same account.
     */
    if (last !== undefined && last !== null && sameIdentity(last, answer)) {
      if (storedExternalId(publicId) === answer.externalId) {
        return;
      }
    }
    last = answer;
    /*
     * `identify` alone, with no `reset()` first, even when the stored id names
     * somebody else.
     *
     * The widget already handles that case at the only moment it can be
     * handled safely: `VisitorTokens.forgetIfAnotherPerson`, called from
     * `WidgetClient.init` BEFORE the request goes out, drops the previous
     * person's token, hash, external id and unread watermark when a declared
     * external id differs from the stored one (CHT-S-03). An `identify()` goes
     * through that same `init`.
     *
     * Resetting first would be strictly worse, not merely redundant: `reset()`
     * boots a fresh anonymous session, so the visitor pays an extra round trip
     * and sees an anonymous widget flash between the two — and the stored keys
     * end up identical either way, because both paths go through `forget()`.
     */
    dispatch('identify', answer);
  };

  const refresh = (): void => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    generation += 1;
    const mine = generation;
    /*
     * The provider is called INSIDE the promise chain, so a synchronous throw
     * lands in the same `.catch` as a rejection. `Promise.resolve().then(fn)`
     * rather than a `try`/`catch` around a call plus a `.catch` on its result,
     * which is two code paths for one failure and is how one of them ends up
     * uncovered.
     *
     * And a REAL `.catch`, not `void somePromise` — a rejection there reaches
     * the customer's page as an unhandled rejection, which their own error
     * reporter then attributes to us. 28 of those were swept out of this repo
     * once already.
     */
    Promise.resolve()
      .then(() => (provider === null ? undefined : provider()))
      .then((answer) => {
        if (stopped || mine !== generation) {
          return;
        }
        apply(normalizeAnswer(answer));
      })
      .catch((err: unknown) => {
        console.warn(
          '[Chatly] the identity provider failed. The visitor was left as they were — ' +
            'only an explicit null signs them out.',
          err,
        );
      })
      .finally(() => {
        inFlight = false;
      });
  };

  /**
   * Re-ask when the tab comes back.
   *
   * This is what closes the case the hand-written loops were written for: a
   * visitor signs out in another tab, comes back to this one, and the widget
   * is still holding their session. `visibilitychange` is the only event that
   * fires for it — `focus` misses a tab switch within the same window on some
   * browsers, and `pageshow` fires only for a back/forward restore.
   *
   * Guarded on `'visible'`: the event fires on the way out as well, and asking
   * the host's server who is signed in as the visitor LEAVES is a request
   * nobody reads the answer to.
   */
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      refresh();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  refresh();

  return {
    resolved: () => last,
    update: (next) => {
      const nextProvider = identityProviderFor(next);
      if (nextProvider === null) {
        /*
         * The host removed the option. The loop keeps its listener and its
         * last answer but stops asking — rather than tearing itself down,
         * because `embed.ts` owns this loop's lifetime and a half-dead object
         * it still holds a reference to is worse than one that is idle. It
         * does NOT reset the visitor: removing the option is not a sign-out.
         */
        provider = null;
        return;
      }
      /*
       * Function identity is the comparison for a callback, which means an
       * inline `identity={async () => …}` arrow looks new on every render.
       * That is harmless here — it refreshes, and `refresh` coalesces — and
       * the alternative (comparing nothing) would never pick up a provider
       * that genuinely changed, e.g. one closing over a new auth context.
       *
       * What it must NOT do is re-init the widget, and it cannot: `identity`
       * and `identityEndpoint` are stripped in `initOptionsFor`, so they never
       * reach the structural comparison that decides a re-init.
       */
      const changed = provider !== nextProvider;
      provider = nextProvider;
      if (changed) {
        refresh();
      }
    },
    refresh,
    stop: () => {
      stopped = true;
      generation += 1;
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

/**
 * Two identities that say the same thing.
 *
 * Deliberately NOT `sameValue` from `same-value.ts`: that one compares
 * `mountTo` Elements by reference and refuses functions, which is right for
 * init options and wrong here, where `getToken` is a provider a host may
 * legitimately re-create per render. Comparing it by reference would make
 * every answer look new and POST an identify on every tab focus.
 *
 * `getToken` is therefore compared by PRESENCE only. That is correct rather
 * than a shortcut: the token it mints lives ~60 seconds and is minted per
 * request inside the widget, so two providers that both mint for the same
 * `externalId` are interchangeable from here.
 */
function sameIdentity(a: ChatlyIdentity, b: ChatlyIdentity): boolean {
  return (
    a.externalId === b.externalId &&
    a.email === b.email &&
    a.name === b.name &&
    a.userHash === b.userHash &&
    a.userToken === b.userToken &&
    (a.getToken === undefined) === (b.getToken === undefined) &&
    JSON.stringify(a.attributes ?? null) === JSON.stringify(b.attributes ?? null)
  );
}

/**
 * The init options a re-init should carry, given what the loop knows.
 *
 * This is the "called before any re-init" half of CHT-D10, and it is a
 * SYNCHRONOUS substitution rather than an awaited fetch, deliberately. A
 * re-init happens because some other option changed — a theme, a locale
 * bundle, a `behavior` key — and making the visitor's panel wait on the host's
 * identity route before it comes back would make every one of those changes
 * slower than it is today. The last answer is already in hand; it goes in, and
 * `refresh()` runs alongside.
 *
 * `undefined` (no answer yet) leaves `visitor` exactly as it was, so a host
 * that passes both `visitor` and `identity` keeps its prop until the loop has
 * something better to say.
 */
export function withResolvedIdentity(
  init: ChatlyInitOptions,
  resolved: ChatlyIdentity | null | undefined,
): ChatlyInitOptions {
  if (resolved === undefined) {
    return init;
  }
  if (resolved === null) {
    // `visitor` REMOVED, not set to undefined: the widget's `reset()` drops it
    // from the options it remembers, and an init that names nobody must not
    // carry an empty identity object either.
    const { visitor: _signedOut, ...anonymous } = init;
    return anonymous;
  }
  return { ...init, visitor: resolved };
}
