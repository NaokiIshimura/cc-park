import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GuiApp } from './GuiApp.js';
import './styles.css';

/**
 * renderer のエントリ。
 *
 * 設定が揃ってから描画すると GuiApp 側に読み込み状態を持たせずに済むため、
 * 起動時設定の取得だけを待ってからマウントする。
 */
const config = await window.ccPark.getConfig();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root が見つかりません');
}

createRoot(container).render(
  <StrictMode>
    <GuiApp config={config} bridge={window.ccPark} />
  </StrictMode>,
);
