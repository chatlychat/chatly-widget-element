/**
 * The nonce helpers.
 *
 * Two behaviours worth pinning, and both are about a mismatch between what
 * the DOM reports and what the browser's CSP check reads: a nonce has to be
 * on the element before it is inserted, and after insertion under a
 * header-delivered CSP the attribute is blank while the property is not.
 */
import { describe, expect, it } from 'vitest';

import { applyNonce, readNonce } from './nonce.js';

describe('applyNonce', () => {
  it('writes both the property and the attribute', () => {
    // The property is what populates `[[CryptographicNonce]]`, which is what
    // the browser checks. The attribute is what everything else can see.
    const script = document.createElement('script');
    applyNonce(script, 'n0nce');
    expect(script.nonce).toBe('n0nce');
    expect(script.getAttribute('nonce')).toBe('n0nce');
  });

  it('leaves an element untouched when there is no nonce', () => {
    // The no-nonce case must be byte-identical to what this package injected
    // before the option existed: no attribute at all.
    const script = document.createElement('script');
    applyNonce(script, undefined);
    expect(script.hasAttribute('nonce')).toBe(false);
  });

  it('stamps an element with no nonce property at all', () => {
    /*
     * The reason the property write is behind a branch. `HTMLOrSVGElement` is
     * what carries `nonce`, so an element outside it — a foreign-namespace
     * element here — has `setAttribute` and nothing else, and a
     * property-only implementation would stamp it with nothing at all while
     * every other test in this file still passed.
     */
    const foreign = document.createElementNS('urn:chatly:test', 'script');
    expect('nonce' in foreign).toBe(false);
    applyNonce(foreign, 'n0nce');
    expect(foreign.getAttribute('nonce')).toBe('n0nce');
  });

  it('treats an empty nonce as absent rather than stamping one', () => {
    /*
     * `nonce=""` is not a neutral no-op under a nonce-only policy: it is an
     * element that declares a nonce and fails to match it, which reports as
     * "blocked" instead of "no nonce was configured". An unset env var read
     * as `?? ''` is the way a host lands here.
     */
    const script = document.createElement('script');
    applyNonce(script, '');
    expect(script.hasAttribute('nonce')).toBe(false);
  });
});

describe('readNonce', () => {
  it('reads the attribute when that is all there is', () => {
    const el = document.createElement('div');
    el.setAttribute('nonce', 'from-attribute');
    expect(readNonce(el)).toBe('from-attribute');
  });

  it('prefers the property when the browser has BLANKED the attribute', () => {
    /*
     * The case the whole helper exists for. Under a header-delivered CSP the
     * browser blanks the nonce content attribute on connection and keeps the
     * value in the element's internal slot, which the IDL property exposes.
     * jsdom reflects the two onto each other, so the split is constructed
     * here — it is not reproducible any other way, and a `getAttribute` read
     * passes every test in this file without it.
     */
    const el = document.createElement('div');
    Object.defineProperty(el, 'nonce', { value: 'from-property', configurable: true });
    el.setAttribute('nonce', '');
    expect(el.getAttribute('nonce')).toBe('');
    expect(readNonce(el)).toBe('from-property');
  });

  it('is undefined, not empty, when there is no nonce', () => {
    // `undefined` so a caller can spread it into an options object without
    // writing an empty nonce over a real one.
    expect(readNonce(document.createElement('div'))).toBeUndefined();
  });
});
