/**
 * `sameValue` / `sameOptions` — did the host page ask for something different?
 *
 * ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════
 *
 * These two functions had no spec of their own. They were covered only
 * through `embed.spec.ts`, which drives them with the options a test author
 * happened to write — and every one of those authors wrote plain data. So the
 * two FUNCTION-valued options this package passes through, `visitor.getToken`
 * and `contextTokenProvider`, were never compared by anything.
 *
 * Both were broken, and in the documented form. `getToken: () => …` written
 * inline is a new function on every React render, so `reconcile` saw a
 * changed `visitor` on every commit and dispatched an `identify` — re-minting
 * an identity token each time. `contextTokenProvider` is not in `reconcile`'s
 * ignore list, so an inline one re-initialised the widget on every render,
 * destroying and remounting it and closing the visitor's panel mid-sentence.
 *
 * That is exactly the hazard `initOptionsFor` strips `identity` for. These
 * two reached the comparison by other doors, which is the lesson worth
 * keeping: the strip list is per-OPTION and the hazard is per-TYPE.
 */
import { describe, expect, it } from 'vitest';

import { sameOptions, sameValue } from './same-value.js';

import type { ChatlyInitOptions } from './types.js';

const PUBLIC_ID = 'acme-web';

describe('sameValue on a function', () => {
  it('reads two different functions as the same request', () => {
    /*
     * CONTROL: delete the `typeof a === 'function' && typeof b === 'function'`
     * arm from `sameValue` and this fails — which is the state the package
     * shipped in, because the next arm (`typeof a !== 'object'`) answers
     * `false` for any two functions.
     */
    expect(sameValue(() => 'a', () => 'a')).toBe(true);
    expect(sameValue(() => 'a', () => 'different body entirely')).toBe(true);
  });

  it('still reads a provider appearing or disappearing as a change', () => {
    /*
     * PRESENCE is the thing that matters, so the fix must not collapse to
     * "functions are always equal". A host that stops passing `getToken` has
     * asked for something different.
     *
     * CONTROL: move the function arm ABOVE the `undefined`/`null` arm in
     * `sameValue` and these start reading as unchanged.
     */
    const fn = (): string => 'token';
    expect(sameValue(fn, undefined)).toBe(false);
    expect(sameValue(undefined, fn)).toBe(false);
    expect(sameValue(fn, null)).toBe(false);
  });

  it('does not read a function as equal to a plain value', () => {
    const fn = (): string => 'token';
    expect(sameValue(fn, 'token')).toBe(false);
    expect(sameValue(fn, {})).toBe(false);
  });
});

describe('sameOptions on the two options that carry a provider', () => {
  it('does not re-identify a visitor over a re-created getToken arrow', () => {
    /*
     * The documented OIDC form, rendered twice. `packages/sdk-js`'s own
     * example is an inline arrow, so this is the ordinary case rather than a
     * pathological one.
     *
     * CONTROL: as above — without the function arm in `sameValue`, these two
     * option sets differ, `reconcile` calls `identifyOrReset` on every React
     * commit, and each call mints a fresh ~60-second token.
     */
    const first: ChatlyInitOptions = {
      publicId: PUBLIC_ID,
      visitor: { getToken: () => 'minted-on-render-1' },
    };
    const second: ChatlyInitOptions = {
      publicId: PUBLIC_ID,
      visitor: { getToken: () => 'minted-on-render-2' },
    };
    expect(sameOptions(first, second)).toBe(true);
    expect(sameValue(first.visitor, second.visitor)).toBe(true);
  });

  it('does not re-init the widget over a re-created contextTokenProvider', () => {
    /*
     * This is the worse of the two: `contextTokenProvider` is NOT in
     * `reconcile`'s ignore list (`['visitor', 'theme']`), so a difference
     * here destroys and remounts the widget.
     */
    expect(
      sameOptions(
        { publicId: PUBLIC_ID, contextTokenProvider: () => 'ctx-1' },
        { publicId: PUBLIC_ID, contextTokenProvider: () => 'ctx-2' },
      ),
    ).toBe(true);
  });

  it('still sees a real change beside a re-created provider', () => {
    /*
     * The control for the control: the function arm must not make the whole
     * comparison permissive. A changed `apiUrl` next to a re-created provider
     * is still a change.
     *
     * `apiUrl` rather than `locale`, which is not a member of
     * `ChatlyInitOptions` — it is one of the six keys `initOptionsFor` STRIPS
     * before this comparison ever sees them, so a test written with it does
     * not typecheck. Worth the note: the strip list is exactly what decides
     * which options can reach here.
     */
    expect(
      sameOptions(
        { publicId: PUBLIC_ID, apiUrl: 'https://a.test', contextTokenProvider: () => 'ctx-1' },
        { publicId: PUBLIC_ID, apiUrl: 'https://b.test', contextTokenProvider: () => 'ctx-2' },
      ),
    ).toBe(false);
  });

  it('sees a provider being removed', () => {
    const fn = (): string => 'ctx';
    expect(
      sameOptions({ publicId: PUBLIC_ID, contextTokenProvider: fn }, { publicId: PUBLIC_ID }),
    ).toBe(false);
  });
});
