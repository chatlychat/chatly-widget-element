/**
 * The CSP nonce, and the two places it is easy to get wrong.
 *
 * ── What the nonce is for ───────────────────────────────────────────────
 *
 * A host page served with `script-src 'nonce-abc123'` and no `'unsafe-inline'`
 * runs a script only if that script carries `nonce="abc123"`. The widget is
 * embedded by APPENDING script elements, so every one of them has to be
 * stamped or the chat simply never appears — and the failure is entirely in
 * the browser's console, under the host page's own CSP violation report,
 * where it reads as the customer's configuration problem rather than ours.
 *
 * This package injects exactly ONE element — the `loader.js` script in
 * `embed.ts` — and no `<style>` at all. It is not the whole chain: the loader
 * appends `widget.js`, the bundle appends its chunk scripts, and the bundle's
 * stylesheet falls back to a `<style>` element where `adoptedStyleSheets` is
 * unavailable. Those live in `apps/widget-loader` and `apps/widget` and read
 * the nonce off the shim (`window.Chatly.nonce`), which `embed.ts` sets before
 * it injects anything. A nonce that reaches two of three injection points
 * does not make the page work, so there is no partial credit here.
 *
 * ── Trap 1: the attribute is BLANKED, the property is not ───────────────
 *
 * HTML's nonce-hiding: when an element that includes `HTMLOrSVGElement`
 * becomes browsing-context connected and the document has a HEADER-delivered
 * CSP, the user agent sets the element's `nonce` CONTENT ATTRIBUTE to the
 * empty string while preserving its internal `[[CryptographicNonce]]`. The
 * IDL property keeps the value; `getAttribute('nonce')` returns `''`.
 *
 * That applies to every element, not only `<script>` and `<style>` — so
 * `<chatly-widget nonce="abc123">` on a page with a header CSP has an EMPTY
 * nonce attribute by the time anything reads it, and a `getAttribute`-shaped
 * read of it works perfectly in every test and in every `<meta>`-delivered
 * CSP (which is not hidden) and returns nothing at all on the real customer
 * page this feature exists for. Hence `readNonce`: the property first, the
 * attribute only as the fallback.
 *
 * ── Trap 2: it has to be set BEFORE insertion ───────────────────────────
 *
 * The CSP check happens when the script is inserted — the "prepare the script
 * element" steps — so a nonce assigned after `appendChild` is a nonce the
 * browser never saw. `applyNonce` is therefore called on a detached element,
 * and `embed.spec.ts` asserts the ordering rather than the end state, because
 * the end state looks identical either way.
 *
 * ── Why a nonce is never cached, memoised or remembered ─────────────────
 *
 * A nonce is per-RESPONSE. Reusing one across responses defeats it entirely:
 * an attacker who can read one page's nonce can then inject a script into the
 * next. So nothing here stores it — `applyNonce` writes it onto one element
 * and returns, `readNonce` derives it from the live DOM on every call, and
 * `embed.ts` holds it only for the lifetime of the document it booted in. The
 * one piece of state in this package that outlives a mount is the
 * `script[data-chatly-loader]` marker, which is a DOM node in the same
 * document as the nonce that stamped it.
 */

/** An element that may carry a nonce — the `HTMLOrSVGElement` half of one. */
type NonceCarrier = Element & { nonce?: string };

/**
 * Stamp a nonce onto an element that has not been inserted yet.
 *
 * The attribute AND the property, and it is worth being exact about why,
 * because it is not two independent mechanisms:
 *
 *   - In a spec-compliant engine either write alone is enough. Setting the
 *     content attribute runs the nonce attribute-change steps, which set
 *     `[[CryptographicNonce]]`; setting the property sets the slot and
 *     reflects back out to the attribute. The CSP check reads the slot, so
 *     both routes reach it, and the two are observably identical afterwards.
 *   - The attribute is the one that is unconditional. The property only
 *     exists on elements that include `HTMLOrSVGElement`, so the branch is
 *     what lets this be called on anything with `setAttribute` without
 *     silently stamping nothing.
 *
 * So: the attribute first, as the write that always lands, and the property
 * second for the engine whose reflection runs the other way. The pair is
 * belt-and-braces rather than two halves of one thing — and because they
 * reflect onto each other in jsdom, removing EITHER of them is invisible to
 * this package's suite. `nonce.spec.ts` covers what it honestly can: the
 * no-property element, which only the attribute write reaches.
 *
 * Empty and absent are the same thing and both mean "do not stamp". A literal
 * `nonce=""` is not a neutral no-op: under a nonce-only policy it is an
 * element that declares a nonce and fails to match, which is a 'blocked'
 * rather than the honest 'no nonce was configured'.
 */
export function applyNonce(element: NonceCarrier, nonce: string | undefined): void {
  if (nonce === undefined || nonce === '') {
    return;
  }
  element.setAttribute('nonce', nonce);
  if ('nonce' in element) {
    element.nonce = nonce;
  }
}

/**
 * Read a nonce off an element, property first.
 *
 * `undefined` rather than `''` for absent, so a caller can spread it into an
 * options object without writing an empty nonce over a real one.
 *
 * The property is tried first because of nonce-hiding (see the header) and
 * the attribute second because jsdom, an SSR serialisation and a browser
 * without the reflected property only have that. They agree in every case
 * except the one that matters.
 */
export function readNonce(element: NonceCarrier): string | undefined {
  const fromProperty = element.nonce;
  if (typeof fromProperty === 'string' && fromProperty !== '') {
    return fromProperty;
  }
  const fromAttribute = element.getAttribute('nonce');
  return fromAttribute === null || fromAttribute === '' ? undefined : fromAttribute;
}
