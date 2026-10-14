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
import { controls, startWidget, type ChatlyEmbedHandle } from './embed.js';

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
   * site under a consent banner. Passed through as the raw string; the widget
   * treats anything other than `deny` as allowed, which keeps every existing
   * embed unchanged.
   */
  { attribute: 'storage', option: 'storage' },
  { attribute: 'css-overrides', option: 'cssOverrides' },
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
 */
export const ELEMENT_EVENTS = [
  'ready',
  'open',
  'close',
  'message',
  'conversation',
  'identified',
  'reset',
  'action',
  'error',
] as const;

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
  visitor?: ChatlyIdentity;
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

    public get visitor(): ChatlyIdentity | undefined {
      return this.#props.get('visitor') as ChatlyIdentity | undefined;
    }
    public set visitor(value: ChatlyIdentity | undefined) {
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
      for (const { attribute, option, json } of ATTRIBUTES) {
        const raw = this.getAttribute(attribute);
        if (raw === null) {
          continue;
        }
        const value = json === true ? parseJsonAttribute(this, attribute, raw) : raw;
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
     * Written out rather than generated from `ELEMENT_EVENTS` in a loop: the
     * handler signatures differ (`onOpen` takes nothing, `onReady` a session),
     * and assigning through a string index would need a cast that defeats the
     * one thing the compiler is useful for here — noticing that a handler name
     * in `ChatlyEmbedHandlers` has no `chatly-*` event.
     */
    #handlers(): ChatlyEmbedHandlers {
      const emit =
        (name: ChatlyElementEvent) =>
        (detail?: unknown): void => {
          this.dispatchEvent(
            new CustomEvent(`chatly-${name}`, { detail, bubbles: true, composed: true }),
          );
        };
      return {
        onReady: emit('ready'),
        onOpen: emit('open'),
        onClose: emit('close'),
        onMessage: emit('message'),
        onConversation: emit('conversation'),
        onIdentified: emit('identified'),
        onReset: emit('reset'),
        onAction: emit('action'),
        onError: emit('error'),
      };
    }
  };
}
