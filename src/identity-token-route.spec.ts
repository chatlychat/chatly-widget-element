/**
 * CHT-L2: an identity route that answers `{token}` rather than an identity.
 *
 * LinkHub's `AtlasProvider` is mounted only on their sign-in pages; after
 * sign-in they swap the Atlas session for their own `__Host-` cookie, so
 * `getToken()` in the browser returns nothing and a client-side launcher
 * would leave every dashboard visitor anonymous. Their server route answers
 * `{token: "<~60s token>"}`, shared with Cookie Munch and Forumulate.
 *
 * The assertions are on WHAT WAS DISPATCHED and on what the provider asked
 * the network for — never on a canned response, which is the house failure
 * mode (four mobile SDKs shipped an unusable handshake behind a green suite
 * built that way).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { identityProviderFor, normalizeAnswer } from './identity-loop.js';

const okJson = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

describe('an identityEndpoint answering {token}', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stub = (body: unknown, ok = true): void => {
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url);
      return Promise.resolve(
        ok
          ? okJson(body)
          : ({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
      );
    });
  };

  it('becomes a getToken provider, NOT a static userToken', async () => {
    stub({ token: 'tok-1' });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/token' });
    const answer = await provider?.();
    // A static token would be a dead credential about a minute later.
    expect(answer).toEqual({ getToken: expect.any(Function) });
    expect('userToken' in (answer as object)).toBe(false);
  });

  it('re-reads the route every time the widget asks for a token', async () => {
    let n = 0;
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url);
      n += 1;
      return Promise.resolve(okJson({ token: `tok-${String(n)}` }));
    });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/token' });
    const answer = (await provider?.()) as { getToken: () => Promise<string | null> };
    expect(await answer.getToken()).toBe('tok-2');
    expect(await answer.getToken()).toBe('tok-3');
    // Fresh by construction: no expiry timer, and nothing polls.
    expect(calls).toEqual(['/api/token', '/api/token', '/api/token']);
  });

  it('answers null — anonymous, not an exception — when the route fails', async () => {
    stub({ token: 'tok-1' });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/token' });
    const answer = (await provider?.()) as { getToken: () => Promise<string | null> };
    stub({}, false);
    await expect(answer.getToken()).resolves.toBeNull();
  });

  it('answers null when the route stops returning a token', async () => {
    stub({ token: 'tok-1' });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/token' });
    const answer = (await provider?.()) as { getToken: () => Promise<string | null> };
    stub({ token: null });
    await expect(answer.getToken()).resolves.toBeNull();
  });

  it('passes an envelope through untouched, so the existing contract is unchanged', async () => {
    stub({ identity: { externalId: 'u-1' } });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/id' });
    expect(await provider?.()).toEqual({ identity: { externalId: 'u-1' } });
  });

  it('does NOT wrap {token: null} in a provider claiming somebody', async () => {
    stub({ token: null });
    const provider = identityProviderFor({ publicId: 'p', identityEndpoint: '/api/token' });
    const answer = await provider?.();
    expect(answer).toEqual({ token: null });
    // ...and the loop reads that as a sign-out.
    expect(normalizeAnswer(answer)).toBeNull();
  });
});

describe('normalizeAnswer on a bare {token}', () => {
  it('accepts it as a userToken, for a host callback that has no URL to re-read', () => {
    expect(normalizeAnswer({ token: 'tok-1' })).toEqual({ userToken: 'tok-1' });
  });

  it('reads {token: null} as signed out', () => {
    expect(normalizeAnswer({ token: null })).toBeNull();
  });

  it('changes nothing for a token that is not a non-empty string', () => {
    expect(normalizeAnswer({ token: 42 })).toBeUndefined();
    expect(normalizeAnswer({ token: '' })).toBeUndefined();
  });

  it('prefers the envelope when a body carries BOTH keys', () => {
    expect(normalizeAnswer({ identity: { externalId: 'u-1' }, token: 'tok-1' })).toEqual({
      externalId: 'u-1',
    });
  });
});
