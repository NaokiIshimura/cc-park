import { defineConfig } from 'vite';

/**
 * preload のビルド設定。
 * sandbox 有効時の preload は CommonJS である必要があるため、renderer とは別に出力する。
 */
export default defineConfig({
  build: {
    outDir: 'dist/gui',
    // renderer の出力を消さないよう、このビルドでは出力先を空にしない
    emptyOutDir: false,
    target: 'chrome120',
    minify: false,
    lib: {
      entry: 'src/gui/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
});
