import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/cli.tsx',
        'src/**/index.ts',
        // Electron の配線のみでロジックを持たない層。実行には Electron 本体が要る
        'src/gui/main.ts',
        'src/gui/preload.ts',
        'src/gui/renderer/main.tsx',
      ],
    },
  },
});
