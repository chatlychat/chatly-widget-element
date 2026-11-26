/**
 * The two HTTP reads behind `identityEndpoint`.
 *
 * Split out of `identity-loop.ts` on 2026-11-25, when the `{token}` contract
 * (CHT-L2) took that file to 649 of the hard 650 `check-file-size` enforces.
 * The seam is the one this repo keeps finding: the loop owns the POLICY (when
 * to ask, what an answer means, what to dispatch) and this owns the WIRE.
 *
 * `identity-loop.ts` imports these; nothing here imports it, so the edge is
 * one-way like `embed-identity.ts` -> `embed.ts`.
 */
import type { ChatlyIdentityAnswer } from './identity-loop.js';

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
export async function fetchIdentity(endpoint: string): Promise<ChatlyIdentityAnswer> {
  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`[Chatly] identityEndpoint ${endpoint} answered ${String(response.status)}`);
  }
  const body = (await response.json()) as ChatlyIdentityAnswer;
  /*
   * ── A `{token}` route becomes a re-minting provider (CHT-L2) ──────────
   *
   * LinkHub's route answers `{token: "<~60s identity token>"}`. Handing that
   * string on as a `userToken` would work for about a minute and then be a
   * dead credential the widget keeps re-sending — the trap the `userToken`
   * docblock in `types.ts` already warns about.
   *
   * So it becomes a `getToken` closing over this endpoint instead. The widget
   * stores that as its `tokenProvider` and calls it whenever it needs a token
   * (`client-identity.ts`), which makes the token fresh BY CONSTRUCTION — no
   * expiry timer, nothing to get wrong about clock skew, and no periodic
   * request for a visitor who never opens the chat. That last point is what
   * the spec asked for with "only while the panel is open", reached by not
   * polling at all rather than by teaching this loop about panel state.
   *
   * `{token: null}` is NOT handled here. It falls through to
   * `normalizeAnswer`, which turns it into the `null` that signs the visitor
   * out — a provider that answered "nobody" must not be wrapped in a function
   * claiming somebody.
   */
  if (body !== null && typeof body === 'object' && !('identity' in body)) {
    const token = (body as Record<string, unknown>)['token'];
    if (typeof token === 'string' && token !== '') {
      return { getToken: () => fetchToken(endpoint) };
    }
  }
  return body;
}

/**
 * Re-read `{token}` from an identity route, for the widget's token provider.
 *
 * Returns `null` rather than throwing on anything unusable — a non-2xx, a
 * body with no string `token`, an explicit `{token: null}`. This is called on
 * the request path, where `null` means "send no credential, stay anonymous"
 * and is already a value the widget handles; a rejection here would surface as
 * an unhandled one inside `identify`.
 *
 * It does NOT sign anybody out: that decision belongs to the loop above,
 * which is asking the same route the same question on a schedule a visitor's
 * session can actually be observed on.
 */
export async function fetchToken(endpoint: string): Promise<string | null> {
  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as unknown;
    if (body === null || typeof body !== 'object') {
      return null;
    }
    const token = (body as Record<string, unknown>)['token'];
    return typeof token === 'string' && token !== '' ? token : null;
  } catch {
    return null;
  }
}
