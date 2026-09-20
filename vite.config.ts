import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** GUI renderer のビルド設定。Electron から file:// で読むため相対パスで出力する。 */
export default defineConfig({
  root: 'src/gui/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../../dist/gui/renderer',
    emptyOutDir: true,
    // 実行先は Electron の Chromium に限定されるので、過度なダウンレベルを避ける
    target: 'chrome120',
  },
});
