import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    mockReset: true,
    environment: 'happy-dom',
    include: ['test/**/*.{test,spec}.ts'],
  },
});
