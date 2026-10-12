/**
 * The widget's init options, as a dependency-free type.
 *
 * ── Why these are declared again here ───────────────────────────────────
 *
 * The authoritative declaration is `InitOptions` in `apps/widget/src/index.ts`.
 * It cannot be imported: that file is a Preact app entry whose import graph
 * pulls in `preact`, `@preact/signals` and a `?inline` CSS import, and this
 * package ships to a customer's bundler with zero dependencies. The headless
 * SDK makes the same call for the same reason (`packages/sdk-js/src/types.ts`
 * — importing `@livechat/shared` drags zod in, measured at ~11KB gzipped).
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

/** What a `message` event carries. */
export interface ChatlyMessageEvent {
  id: string;
  body: string;
  authorType: string;
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
   * Set the widget's locale once it is up, via `Chatly.setLocale()`.
   *
   * Not an init option — the widget has none. The strings come from `copy`
   * and `copyByLocale` in the embed, so `locale` picks between bundles YOU
   * supplied; asking for a locale with no bundle warns rather than appearing
   * to work. Changing it does NOT re-initialise the widget.
   */
  locale?: string;
}
