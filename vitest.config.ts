import { defineConfig } from 'vitest/config';

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  test: {
    // Worker THREADS, not forked processes. See @livechat/config/vitest.
    ...vitestExecution,
    // jsdom, deliberately: happy-dom does not implement
    // HTMLScriptElement.nonce, and the CSP-nonce specs here read it. A faster
    // environment that cannot observe a security attribute is the wrong trade.
    environment: 'jsdom',
    // A real URL rather than jsdom's `about:blank`, which is an OPAQUE origin
    // where `localStorage` is unavailable. Nothing here touches it directly,
    // but the widget bundle this package drives does, and a test that fakes
    // the bundle should not be the only place that works.
    environmentOptions: { jsdom: { url: 'https://embedder.test/' } },
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
