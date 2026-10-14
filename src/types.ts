/**
 * The widget's init options, as a dependency-free type.
 *
 * ── Why these are declared again here ───────────────────────────────────
 *
 * The authoritative declaration is `InitOptions` in
 * `packages/sdk-js/src/widget-globals.ts` — it moved there out of
 * `apps/widget` so a snippet integrator could install it. This package still
 * cannot IMPORT it: `@chatlychat/widget-element` ships to a customer's
 * bundler with ZERO dependencies, and taking one on `@chatlychat/sdk-js`
 * purely to reach a type would put a second browser SDK in the install graph
 * of every Vue, Svelte and React consumer. A dependency-free copy under a
 * gate is the cheaper of the two.
 *
 * Two copies of a shape is a drift risk, so it is a CHECKED one:
 * `scripts/check-widget-wrapper-parity.mjs` compares the key sets in this file
 * against the widget's own interfaces and fails the build when either side
 * gains a key the other does not have. Without that gate the failure is
 * silent and one-directional — the widget adds `theme.somethingNew`, a React
 * consumer passes it, and TypeScript rejects a value the widget would have
 * honoured.
 *
 * Nothing here is validated at runtime, and that is deliberate (see
 * `coerceConfig` in `embed.ts` for the one place a boundary exists).
 */

/** Identity the host page already knows. Mirrors the widget's `WidgetIdentity`. */
export interface ChatlyIdentity {
  /**
   * Your own stable id for this person. Optional in the type, but it is the
   * only field contacts are matched on — without it every visit creates a new
   * contact.
   */
  externalId?: string;
  email?: string;
  name?: string;
  /**
   * `HMAC-SHA256(<channel IDV secret>, externalId)`, computed by YOUR SERVER.
   * Never in the browser: the secret would be in your page source.
   */
  userHash?: string;
  attributes?: Record<string, unknown>;
}

/** Colours, shape, type and launcher art. Mirrors the widget's `WidgetTheme`. */
export interface ChatlyTheme {
  icons?: Partial<Record<'mic' | 'stop' | 'attachment' | 'check' | 'star', string>>;

  primaryColor?: string;
  primaryContrast?: string;
  background?: string;
  backgroundSubtle?: string;
  foreground?: string;
  foregroundMuted?: string;
  border?: string;
  bubbleAgentBg?: string;
  bubbleAgentFg?: string;

  fontFamily?: string;
  fontSize?: number | string;

  borderRadius?: number | string;
  launcherSize?: number;
  panelWidth?: number;
  panelHeight?: number;

  position?: 'left' | 'right';
  offsetX?: number;
  offsetY?: number;

  headerStyle?: 'gradient' | 'solid' | 'plain';
  headerGradient?: [string, string];

  hideLauncher?: boolean;
  launcherIcon?: string;
  launcherImage?: string;
  launcherPing?: boolean;
  launcherIdleAnimation?: 'none' | 'wiggle' | 'pulse' | 'bounce';

  colorScheme?: 'light' | 'dark' | 'auto';

  dangerColor?: string;
  successColor?: string;
  warningColor?: string;

  hideBranding?: boolean;

  logoUrl?: string;
  agentAvatarUrl?: string;
}

/** Rotating micro-copy bound to a selector. Mirrors `WidgetQuip`. */
export interface ChatlyQuip {
  selector: string;
  lines: string[];
  intervalMs?: number;
  oncePerSession?: boolean;
}

/** Behaviour toggles. Mirrors the widget's `WidgetBehavior`. */
export interface ChatlyBehavior {
  tabs?: Array<'home' | 'messages' | 'help'>;
  defaultTab?: 'home' | 'messages' | 'help';
  autoOpenAfterMs?: number;
  hideOnUrls?: string[];
  helpSearchOnly?: boolean;
  starterPrompts?: string[];
  home?: Array<'start' | 'recent' | 'quickLinks' | 'blocks' | 'helpSearch'>;
  /**
   * A `{ v, blocks }` envelope, the same shape a message carries. `unknown`
   * rather than a block union: the widget validates it at the render boundary
   * precisely so a block type a newer release added does not blank the home
   * screen on an older bundle, and a narrow type here would refuse at compile
   * time the forward compatibility the runtime was built to allow.
   */
  homeBlocks?: unknown;
  draggable?: boolean;
  quips?: ChatlyQuip[];
  confettiClickStreak?: number;
}

/** A Home-tab button. Mirrors `WidgetQuickLink`. */
export interface ChatlyQuickLink {
  label: string;
  href?: string;
  startConversation?: string | { initialMessage?: string };
  description?: string;
  icon?: string;
}

/** Every string in the panel. Mirrors `WidgetCopy`. */
export interface ChatlyCopy {
  greeting?: string;
  greetingSubtitle?: string;
  homeStartCta?: string;
  homeStartCtaSubtitle?: string;
  homeRecentTitle?: string;
  homeQuickLinksTitle?: string;
  homeHelpTitle?: string;
  tabHome?: string;
  tabMessages?: string;
  tabHelp?: string;
  messagesEmpty?: string;
  messagesNewCta?: string;
  helpSearchPlaceholder?: string;
  helpEmpty?: string;
  helpNoResults?: string;
  helpStillNeedHelp?: string;
  composerPlaceholder?: string;
  composerSend?: string;
  poweredBy?: string;
  closeAria?: string;
  backAria?: string;
  unavailableMessage?: string;
  unavailableRetry?: string;
  /**
   * The expected-reply note in the header, shown only while somebody is
   * available to answer. Set it to your real figure, or to an empty string to
   * show nothing.
   *
   * It was a hardcoded sentence the widget showed regardless of staffing, so
   * an unstaffed workspace told every visitor it typically replies within a
   * few minutes.
   */
  responseTimeNote?: string;
}

/**
 * Everything `Chatly.init()` accepts, minus `on`.
 *
 * The lifecycle callbacks are deliberately absent: a wrapper has to install
 * ONE stable set of them at boot and fan out to whatever the host most
 * recently passed, or every render with a fresh inline arrow function would
 * look like a changed config and re-initialise the widget. See
 * `ChatlyEmbedHandlers` and the `handlers` box in `embed.ts`.
 */
export interface ChatlyInitOptions {
  /** Channel public ID. Required. */
  publicId: string;
  apiUrl?: string;
  realtimeUrl?: string;
  visitor?: ChatlyIdentity;
  theme?: ChatlyTheme;
  behavior?: ChatlyBehavior;
  quickLinks?: ChatlyQuickLink[];
  /**
   * Mount inside an element of your own layout instead of floating.
   *
   * Both wrappers set this for you from their own container, so a host rarely
   * passes it directly — in React it is `<ChatlyWidget inline />` and in the
   * custom element it is the `inline` attribute. Passing a selector by hand
   * still works and still carries the widget's refusal behaviour: a selector
   * that matches nothing mounts NOTHING and says so.
   */
  mountTo?: string | Element;
  /**
   * Whether the widget may use the visitor's browser storage. Default
   * `'allow'`.
   *
   * `'deny'` makes every read return nothing and every write a no-op, and
   * purges anything already written. For a consent banner: embed with
   * `'deny'`, then call `setStorageConsent(true)` if the visitor agrees.
   */
  storage?: 'allow' | 'deny';

  cssOverrides?: string;
  copy?: ChatlyCopy;
  copyByLocale?: Record<string, ChatlyCopy>;
}

/**
 * The widget's event names, as `Chatly.on()` spells them.
 *
 * `ready` is a state rather than a moment — the widget replays the last one
 * to a late subscriber — and both wrappers rely on that, because a React
 * effect or a `connectedCallback` can easily run after the session is up.
 */
export type ChatlyEventName =
  | 'ready'
  | 'open'
  | 'close'
  | 'message'
  | 'conversation'
  | 'identified'
  | 'reset'
  | 'action'
  | 'error';

/** What a `ready` or `identified` event carries. */
export interface ChatlySession {
  contactId: string | null;
  workspaceId: string;
}

/**
 * What a `message` event carries.
 *
 * `id` is the MESSAGE's id. `conversationId` is the thread it landed in, or
 * `null` before one exists — it was added to the widget's payload because `id`
 * alone gave a host page nothing to correlate against, and it was missing here
 * for exactly as long as it takes a second copy of a shape to drift: the
 * widget emitted the key, the React wrapper's `onMessage` type did not declare
 * it, so a consumer reading `m.conversationId` got a type error for a value
 * that was sitting in the object. `check-widget-wrapper-parity.mjs` compares
 * this interface against `InitOptions.on.message`'s parameter now.
 */
export interface ChatlyMessageEvent {
  id: string;
  body: string;
  authorType: string;
  conversationId: string | null;
}

/**
 * Subscribers a wrapper forwards to.
 *
 * Every one is optional and every one is called with whatever the widget
 * emitted — these are not re-typed payloads, they are the widget's own.
 */
export interface ChatlyEmbedHandlers {
  onReady?: (session: ChatlySession) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (message: ChatlyMessageEvent) => void;
  onConversation?: (detail: unknown) => void;
  onIdentified?: (session: ChatlySession) => void;
  onReset?: (detail: unknown) => void;
  /** A visitor pressed a `host_event` action on a rich block. */
  onAction?: (detail: unknown) => void;
  /**
   * The widget could not do something it was asked to do.
   *
   * Reported rather than thrown. The widget's own `chatly:error` event is the
   * source, and it fires for a refused origin, a dead network and a 5xx —
   * none of which a host page can do anything about by crashing.
   */
  onError?: (detail: unknown) => void;
}

/**
 * When the widget bundle is fetched.
 *
 * Not an init option — the widget has no such setting and must not get one.
 * This is the LOADER's, and the loader is the only thing on the page early
 * enough for it to mean anything: by the time `widget.js` is running, the
 * bytes it would have saved are already spent.
 *
 *   - `false` (default) — fetch it on page load, which is what every embed
 *     has always done. ~44KB gzipped per page view, whether or not the
 *     visitor ever opens the chat.
 *   - `true` / `'launcher'` — fetch it when a visitor reaches for the chat.
 *     The loader paints a stand-in launcher that matches the real one and
 *     queues the click, so the panel opens as soon as the bundle lands.
 *   - `'interaction'` — as `'launcher'`, and additionally pre-warm on the
 *     visitor's first interaction with the page. Suppressed under
 *     `prefers-reduced-data` or the browser's data saver.
 *   - `'manual'` — fetch nothing and paint nothing until something calls
 *     `Chatly('load')`. For a host page that renders its own launcher, which
 *     is what `<ChatlyLauncher>` in `@chatlychat/widget-react` does.
 *
 * Read ONCE, when `loader.js` evaluates. Changing it afterwards cannot
 * un-fetch a bundle, so the wrapper warns rather than pretending.
 */
export type ChatlyLazyMode = boolean | 'launcher' | 'interaction' | 'manual';

/** Where `loader.js` is served from, plus the init options. */
export interface ChatlyEmbedOptions extends ChatlyInitOptions {
  /**
   * The loader script URL.
   *
   * Defaults to `https://widget.chatlychat.com/loader.js`, which is where we
   * serve it. Set it only if you serve `loader.js` from your own CDN — and if
   * you do, `widget.js` and its chunks must sit beside your copy, because the
   * loader resolves them from its own URL. Point it at a loader that is not
   * beside its bundle and you get a chat bubble that renders and then cannot
   * load its engine, rather than a clean failure.
   *
   * `GET /v1/channels/:id` returns the right value for your deployment as
   * `embed.loaderUrl`. Use that rather than typing a host.
   */
  loaderUrl?: string;
  /**
   * Defer the widget bundle until a visitor wants it. See `ChatlyLazyMode`.
   *
   * Off by default, deliberately: this changes the behaviour of the one
   * script that runs on every page of a customer's site, and that is not a
   * thing to switch on for people who have not read about it.
   */
  lazy?: ChatlyLazyMode;
  /**
   * Set the widget's locale once it is up, via `Chatly.setLocale()`.
   *
   * Not an init option — the widget has none. The strings come from `copy`
   * and `copyByLocale` in the embed, so `locale` picks between bundles YOU
   * supplied; asking for a locale with no bundle warns rather than appearing
   * to work. Changing it does NOT re-initialise the widget.
   */
  locale?: string;
}
