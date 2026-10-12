import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
