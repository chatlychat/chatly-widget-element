/**
 * `<chatly-widget>` — the widget as a custom element.
 *
 * ── Why the class is built inside a function ────────────────────────────
 *
 * `class X extends HTMLElement {}` is evaluated when its MODULE is evaluated,
 * and `HTMLElement` does not exist in Node. A top-level class would therefore
 * throw `ReferenceError: HTMLElement is not defined` the moment a Next.js
 * server component, a Remix loader or a Vitest node-environment test imported
 * anything from this package — including just a type. That is not a
 * theoretical risk: it is the single most common way a web-component package
 * breaks an SSR build, and the stack trace points at the framework rather
 * than at us.
 *
 * So the class is created lazily by `defineChatlyWidget()`, the main entry has
 * no side effects at all, and `@chatlychat/widget-element/register` is the
 * opt-in that defines the tag. A React consumer pulling this package in for
 * the embed lifecycle never registers an element they did not ask for.
 *
 * ── Attributes vs properties ────────────────────────────────────────────
 *
 * HTML attributes are strings. `theme`, `behavior`, `visitor`, `copy`,
 * `copy-by-locale` and `quick-links` are objects, so each is accepted BOTH as
 * a JSON attribute (for a page that is really just HTML) and as a property
 * (for a framework template that has a real object to hand). The property
 * wins when both are set, because a framework binding is the more specific
 * statement.
 */
import { controls } from './controls.js';
import { startWidget, type ChatlyEmbedHandle } from './embed.js';
import {
  domSuffix,
  EVENT_HANDLERS,
  WIDGET_EVENT_NAMES,
  type ChatlyDomEventSuffix,
} from './events.js';
import { readNonce } from './nonce.js';

import type {
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyIdentity,
  ChatlyQuickLink,
  ChatlyTheme,
} from './types.js';

/** The default tag name. Overridable in `defineChatlyWidget`. */
export const CHATLY_WIDGET_TAG = 'chatly-widget';

/**
 * Attribute names, and the option each one sets.
 *
 * Kebab-case on the outside because that is what HTML authors expect and what
 * `attributeChangedCallback` reports; camelCase on the inside because that is
 * the widget's own option name. `json: true` marks the ones parsed rather
 * than passed through.
 */
const ATTRIBUTES: ReadonlyArray<{
  readonly attribute: string;
  readonly option: keyof ChatlyEmbedOptions;
  readonly json?: true;
  /** Overrides the plain `getAttribute` read. One row needs it — see `nonce`. */
  readonly read?: (element: HTMLElement) => string | null;
  /**
   * Overrides the VALUE step rather than the read step. One row needs it —
   * see `tracking`, whose value may be a boolean, which `json` refuses and a
   * pass-through string cannot express.
   */
  readonly parse?: (element: HTMLElement, raw: string) => unknown;
}> = [
  { attribute: 'public-id', option: 'publicId' },
  { attribute: 'api-url', option: 'apiUrl' },
  { attribute: 'realtime-url', option: 'realtimeUrl' },
  { attribute: 'loader-url', option: 'loaderUrl' },
  /*
   * `lazy` passes through as the raw string, including the EMPTY string a
   * bare `<chatly-widget lazy>` produces. The loader is what interprets it
   * (`normalizeLazy`), and it reads `''` as on — which is wrong in
   * JavaScript and right in HTML, where a valueless attribute means
   * presence. Coercing here instead would put a second interpreter of the
   * same value in a second package.
   */
  { attribute: 'lazy', option: 'lazy' },
  { attribute: 'locale', option: 'locale' },
  /*
   * `storage="deny"` holds back every write to the visitor's browser, for a
   * site under a consent banner. Passed through as the raw string, because
   * the widget is the one interpreter of the value.
   *
   * It does NOT treat anything other than `deny` as allowed, which this
   * comment claimed until 2026-10-19 and which was never quite true of the
   * widget: an unrecognised value fails CLOSED and warns (Numera NEW-6), and
   * an ABSENT one is now `'on-open'` rather than `'allow'` (CHT-S-01). The
   * attribute is still free-form; `'allow'` is the opt-in to eager storage.
   */
  { attribute: 'storage', option: 'storage' },
  /*
   * `consent="auto"` and `consent-category` (CHT-X02): raw strings, because
   * the LOADER is the one interpreter — it reads them off the queued `init`
   * before the widget exists, and treats anything but `auto` as off.
   */
  { attribute: 'consent', option: 'consent' },
  { attribute: 'consent-category', option: 'consentCategory' },
  // `analytics="grant"` (B08): raw string; the widget accepts only 'grant'.
  { attribute: 'analytics', option: 'analytics' },
  /*
   * `tracking` is the one row that needs neither pass-through nor `json`.
   *
   * Pass-through is wrong because the value is a BOOLEAN and the widget's
   * `applyTracking` fails closed: `'false'` would be read as off, which is
   * right, and `'true'` would be read as off too, which silently removes a
   * feed the author asked for. `json: true` is wrong because
   * `parseJsonAttribute` refuses anything that is not an object or an array,
   * so `tracking="false"` would be rejected with an error and the option
   * dropped — leaving tracking ON for an author who spelled it off. That is
   * the "control that appears to work" failure, on a privacy switch.
   *
   * So it has its own reader. See `parseTrackingAttribute`.
   */
  { attribute: 'tracking', option: 'tracking', parse: parseTrackingAttribute },
  /*
   * `identity-fallback="anonymous"` keeps chat working when the channel
   * refuses the signed identity — a rotated `userHash` secret otherwise
   * removes the widget for every signed-in visitor at once. Passed through as
   * the raw string for the same reason `storage` is: the widget is the one
   * interpreter of the value, and anything other than `anonymous` leaves the
   * default behaviour, which is to show the failure.
   */
  { attribute: 'identity-fallback', option: 'identityFallback' },
  /*
   * `identity-endpoint="/api/chatly/identity"` is the identity loop's
   * declarative half (CHT-D10) and the only half HTML can express: its
   * sibling option `identity` is a FUNCTION, and there is no attribute
   * spelling for one. A host with a callback sets it as a property instead —
   * `el.config = { identity: async () => … }` — which `#options()` already
   * merges over the attributes, so no row is needed for it and the parity
   * gate carries a `widgetOnly` exemption saying so.
   *
   * Passed through as the raw string: it is a URL, and the one interpreter of
   * it is `fetchIdentity` in `identity-loop.ts`.
   */
  { attribute: 'identity-endpoint', option: 'identityEndpoint' },
  { attribute: 'css-overrides', option: 'cssOverrides' },
  /*
   * `nonce` is read through `element.nonce`, NOT `getAttribute('nonce')`.
   *
   * HTML hides a nonce: when an element that includes `HTMLOrSVGElement`
   * becomes browsing-context connected and the document carries a
   * HEADER-delivered CSP, the browser blanks the nonce CONTENT ATTRIBUTE and
   * keeps the value only in the element's internal `[[CryptographicNonce]]`,
   * which the IDL property exposes. That applies to every element, this one
   * included.
   *
   * So a `getAttribute` read works in jsdom, works under a `<meta>`-delivered
   * policy (not hidden), and returns the empty string on the real
   * header-CSP page the whole feature exists for. `readNonce` tries the
   * property first and the attribute second; they agree everywhere except
   * the case that matters.
   */
  { attribute: 'nonce', option: 'nonce', read: (el) => readNonce(el) ?? null },
  { attribute: 'theme', option: 'theme', json: true },
  { attribute: 'behavior', option: 'behavior', json: true },
  { attribute: 'visitor', option: 'visitor', json: true },
  { attribute: 'copy', option: 'copy', json: true },
  { attribute: 'copy-by-locale', option: 'copyByLocale', json: true },
  { attribute: 'quick-links', option: 'quickLinks', json: true },
];

/**
 * `inline` is handled separately: it is boolean (present/absent) and it does
 * not carry a value, it decides whether `mountTo` is this element.
 */
const INLINE_ATTRIBUTE = 'inline';

const OBSERVED = [...ATTRIBUTES.map((a) => a.attribute), INLINE_ATTRIBUTE];

/**
 * The events the element re-dispatches, and the handler each comes from.
 *
 * Prefixed `chatly-` rather than `chatly:` — a colon is legal in an event
 * name but not in a Vue/Angular/Svelte template binding, which is most of the
 * audience for a custom element. They bubble and are `composed` so a listener
 * on an ancestor (or outside a shadow root the host page put us in) hears them.
 *
 * A dot in a widget event name becomes a dash for the same reason, so
 * `message.ack` is `chatly-message-ack` — see `domSuffix` in `events.ts`.
 *
 * Written out rather than derived from `EVENT_HANDLERS`, because this is a
 * PUBLISHED literal tuple: deriving it would widen `ChatlyElementEvent` to
 * `string` and a consumer who narrows on it today would stop being able to.
 * `satisfies` catches a typo or an invented name, and `element.spec.ts`
 * compares it against the derived set in both directions — which is what
 * catches an event added to the map and forgotten here.
 */
export const ELEMENT_EVENTS = [
  'ready',
  'open',
  'close',
  'message',
  'message-ack',
  'message-received',
  'unread',
  'appearance',
  'conversation',
  'conversation-changed',
  'identified',
  'reset',
  'action',
  'navigate',
  'notice',
  'error',
  'profile',
] as const satisfies readonly ChatlyDomEventSuffix[];

/** `chatly-ready`, `chatly-message`, … — the DOM event names, without prefix. */
export type ChatlyElementEvent = (typeof ELEMENT_EVENTS)[number];

/**
 * The object-valued properties, for the pre-upgrade dance in the constructor.
 *
 * Derived from `ATTRIBUTES` plus `config` so a new JSON attribute cannot be
 * added without also being rescued on upgrade — the failure mode there is
 * silent, and a list maintained by hand beside another list is how it would
 * happen.
 */
const PROPERTY_NAMES: readonly string[] = [
  ...ATTRIBUTES.filter((a) => a.json === true).map((a) => a.option),
  'config',
];

/** What `document.querySelector<ChatlyWidgetElement>` gets you. */
export interface ChatlyWidgetElement extends HTMLElement {
  theme?: ChatlyTheme;
  behavior?: ChatlyBehavior;
  /** `null` is "signed out" — see `ChatlyEmbedOptions.visitor`. */
  visitor?: ChatlyIdentity | null;
  copy?: ChatlyCopy;
  copyByLocale?: Record<string, ChatlyCopy>;
  quickLinks?: ChatlyQuickLink[];
  /** The full option object, for a host that would rather set one thing. */
  config?: Partial<ChatlyEmbedOptions>;
  /** `Chatly.open()` and friends, so a reference to the element is enough. */
  readonly controls: typeof controls;
}

/**
 * Parse a JSON attribute, or drop it.
 *
 * ── Why a malformed attribute does not stop the widget ──────────────────
 *
 * A broken `theme` attribute could either (a) refuse to mount, the way the
 * widget refuses a `mountTo` selector that matches nothing, or (b) drop the
 * attribute, say so, and start anyway. (b), because the two cases are not
 * alike: a failed `mountTo` would put an unexpected floating bubble on a page
 * built to embed the chat, which reads as a bug and is easy to miss, whereas a
 * failed `theme` leaves a WORKING chat in the default colours plus a named
 * error in the console. Losing support chat on a customer's site over a
 * trailing comma is the worse trade.
 *
 * ── Why not zod ─────────────────────────────────────────────────────────
 *
 * This package ships to a customer's page with zero dependencies, and zod
 * measured ~11KB gzipped when it reached the widget. There is also nothing
 * for it to be the source of truth ABOUT: the widget's `InitOptions` has no
 * runtime schema on either side of this boundary — it is a typed object
 * literal from the host page — and the server validates what actually reaches
 * it (`widgetInitSchema`). So the boundary asserts what it can honestly
 * assert: this parsed, and it is an object rather than an array or a number.
 */
function parseJsonAttribute(element: HTMLElement, attribute: string, raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      `[Chatly] <${element.localName}> ignored the ${attribute} attribute — it is not valid ` +
        `JSON. The widget still started, without it. ${String(err)}`,
    );
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    console.error(
      `[Chatly] <${element.localName}> ignored the ${attribute} attribute — JSON parsed to ` +
        `${typeof parsed}, and this attribute must be an object or array.`,
    );
    return undefined;
  }
  return parsed;
}

/**
 * `tracking`, whose three legitimate spellings are a boolean, a boolean, and
 * an object.
 *
 *   tracking="false"               — every visitor.* feed off
 *   tracking                       — present, no value: on (HTML's own
 *   tracking="true"                  reading of a valueless attribute, and
 *                                    the same one `lazy` gets)
 *   tracking='{"exitIntent":false}' — one feed off, the rest default
 *
 * Anything else is OFF, and says so. That is the opposite of how every other
 * attribute here degrades — a bad `theme` leaves a working chat in the
 * default colours — and the asymmetry is the point: this is a privacy
 * switch, and the one outcome an author who typed `tracking="off"` cannot
 * have wanted is telemetry. A malformed granular object fails closed for the
 * same reason, rather than falling through to the default.
 */
function parseTrackingAttribute(element: HTMLElement, raw: string): unknown {
  const text = raw.trim();
  if (text === '' || text === 'true') {
    return true;
  }
  if (text.startsWith('{')) {
    return parseJsonAttribute(element, 'tracking', text) ?? false;
  }
  if (text !== 'false') {
    console.error(
      `[Chatly] <${element.localName}> read tracking="${text}" as OFF. The attribute takes ` +
        `"false", "true", or a JSON object such as '{"exitIntent":false}' — an unrecognised ` +
        `value fails closed, because a privacy switch must not be rescued by a typo.`,
    );
  }
  return false;
}

/**
 * Define the element, once.
 *
 * Idempotent and safe to call from anywhere: a second call with a tag that is
 * already registered returns quietly instead of throwing
 * `NotSupportedError: the name "chatly-widget" has already been used`, which
 * is what two bundles each importing `/register` would otherwise produce.
 */
export function defineChatlyWidget(tagName: string = CHATLY_WIDGET_TAG): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') {
    // SSR, or a DOM-less test. Not an error — see the file header.
    return;
  }
  if (customElements.get(tagName) !== undefined) {
    return;
  }
  customElements.define(tagName, buildElementClass());
}

function buildElementClass(): CustomElementConstructor {
  return class ChatlyWidget extends HTMLElement implements ChatlyWidgetElement {
    public static get observedAttributes(): string[] {
      return OBSERVED;
    }

    public readonly controls = controls;

    /*
     * Object props are held in a private map rather than as class fields.
     *
     * `useDefineForClassFields` is on in this repo's tsconfig, so a declared
     * field is installed with `Object.defineProperty` in the constructor —
     * which would CLOBBER a value a framework set on the element before it was
     * upgraded (`el.theme = {…}` then `document.body.append(el)`). Accessors
     * on the prototype plus a private store keep the pre-upgrade value.
     */
    #props = new Map<string, unknown>();
    #handle: ChatlyEmbedHandle | null = null;

    public constructor() {
      super();
      /*
       * The pre-upgrade property dance.
       *
       * A framework that does `el.theme = {…}` before the element is defined
       * (or before this module loads) creates an OWN data property, which
       * shadows the prototype accessor for good: the setter never runs, the
       * private store stays empty, and the theme is silently dropped. Every
       * template engine that binds properties — Vue, Angular, Lit, Svelte —
       * can produce that ordering, and so can plain `createElement` +
       * `append` on a page whose bundle is still loading.
       *
       * So on upgrade, each own property is lifted off the instance and
       * re-assigned, which this time reaches the accessor.
       */
      for (const key of PROPERTY_NAMES) {
        if (!Object.prototype.hasOwnProperty.call(this, key)) {
          continue;
        }
        const value = (this as unknown as Record<string, unknown>)[key];
        delete (this as unknown as Record<string, unknown>)[key];
        (this as unknown as Record<string, unknown>)[key] = value;
      }
    }

    public get theme(): ChatlyTheme | undefined {
      return this.#props.get('theme') as ChatlyTheme | undefined;
    }
    public set theme(value: ChatlyTheme | undefined) {
      this.#setProp('theme', value);
    }

    public get behavior(): ChatlyBehavior | undefined {
      return this.#props.get('behavior') as ChatlyBehavior | undefined;
    }
    public set behavior(value: ChatlyBehavior | undefined) {
      this.#setProp('behavior', value);
    }

    public get visitor(): ChatlyIdentity | null | undefined {
      return this.#props.get('visitor') as ChatlyIdentity | null | undefined;
    }
    public set visitor(value: ChatlyIdentity | null | undefined) {
      this.#setProp('visitor', value);
    }

    public get copy(): ChatlyCopy | undefined {
      return this.#props.get('copy') as ChatlyCopy | undefined;
    }
    public set copy(value: ChatlyCopy | undefined) {
      this.#setProp('copy', value);
    }

    public get copyByLocale(): Record<string, ChatlyCopy> | undefined {
      return this.#props.get('copyByLocale') as Record<string, ChatlyCopy> | undefined;
    }
    public set copyByLocale(value: Record<string, ChatlyCopy> | undefined) {
      this.#setProp('copyByLocale', value);
    }

    public get quickLinks(): ChatlyQuickLink[] | undefined {
      return this.#props.get('quickLinks') as ChatlyQuickLink[] | undefined;
    }
    public set quickLinks(value: ChatlyQuickLink[] | undefined) {
      this.#setProp('quickLinks', value);
    }

    public get config(): Partial<ChatlyEmbedOptions> | undefined {
      return this.#props.get('config') as Partial<ChatlyEmbedOptions> | undefined;
    }
    public set config(value: Partial<ChatlyEmbedOptions> | undefined) {
      this.#setProp('config', value);
    }

    #setProp(key: string, value: unknown): void {
      if (value === undefined) {
        this.#props.delete(key);
      } else {
        this.#props.set(key, value);
      }
      // Only if connected: a property set before the element is in the DOM is
      // configuration, not a change — `connectedCallback` will read it.
      if (this.#handle !== null) {
        this.#handle.update(this.#options(), this.#handlers());
      }
    }

    public connectedCallback(): void {
      if (this.hasAttribute(INLINE_ATTRIBUTE)) {
        /*
         * The element IS the container in inline mode, and the widget fills
         * what it is given. Without `display: block` a custom element is
         * `display: inline`, which collapses to a zero-height box and renders
         * a chat panel nobody can see — the single most reported mistake with
         * inline mounting, and it looks exactly like the widget not loading.
         */
        this.style.display = 'block';
        if (this.style.minHeight === '') {
          this.style.minHeight = '420px';
        }
      }
      this.#handle = startWidget(this, this.#options(), this.#handlers());
    }

    public disconnectedCallback(): void {
      /*
       * A disconnect is not necessarily an unmount: `appendChild` elsewhere in
       * the document fires disconnect then connect, and so does a framework
       * re-keying its list. `startWidget`'s deferred teardown is what makes
       * that survivable — see `release` in embed.ts.
       */
      this.#handle?.stop();
      this.#handle = null;
    }

    public attributeChangedCallback(): void {
      if (this.#handle === null) {
        return;
      }
      this.#handle.update(this.#options(), this.#handlers());
    }

    /** Attributes, then properties (which win), then `config` (which wins). */
    #options(): ChatlyEmbedOptions {
      const options: Record<string, unknown> = {};
      for (const { attribute, option, json, read, parse } of ATTRIBUTES) {
        const raw = read === undefined ? this.getAttribute(attribute) : read(this);
        if (raw === null) {
          continue;
        }
        const value =
          parse !== undefined
            ? parse(this, raw)
            : json === true
              ? parseJsonAttribute(this, attribute, raw)
              : raw;
        if (value !== undefined) {
          options[option] = value;
        }
      }
      for (const [key, value] of this.#props) {
        if (key !== 'config') {
          options[key] = value;
        }
      }
      Object.assign(options, this.config ?? {});
      if (this.hasAttribute(INLINE_ATTRIBUTE)) {
        options['mountTo'] = this;
      }
      // `publicId` may legitimately be missing here — the element can be in
      // the DOM before its framework has bound the attribute. `startWidget`
      // warns and declines rather than booting a widget with no channel.
      return options as unknown as ChatlyEmbedOptions;
    }

    /**
     * Re-dispatch every widget event as a DOM event on this element.
     *
     * Generated from `EVENT_HANDLERS`, which is a reversal: this was written
     * out by hand, on the argument that a string index would need a cast and
     * defeat "the one thing the compiler is useful for here — noticing that a
     * handler name in `ChatlyEmbedHandlers` has no `chatly-*` event". That
     * direction is now `UnreachableHandler` in `events.ts`, which checks it
     * without being able to go stale, and what the hand-written list could
     * not give was the direction that actually broke: three of the widget's
     * twelve events had no `chatly-*` event at all.
     *
     * The cast on the return is the price, and it is at the boundary of a
     * loop whose keys come from an exhaustive map.
     */
    #handlers(): ChatlyEmbedHandlers {
      const handlers: Record<string, (detail?: unknown) => void> = {};
      for (const name of WIDGET_EVENT_NAMES) {
        const type = `chatly-${domSuffix(name)}`;
        handlers[EVENT_HANDLERS[name]] = (detail?: unknown): void => {
          this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
        };
      }
      return handlers as ChatlyEmbedHandlers;
    }
  };
}
