import type { CcParkBridge } from '../ipc.js';

declare global {
  interface Window {
    /** preload が公開する main プロセスへの橋渡し */
    readonly ccPark: CcParkBridge;
  }
}

export {};
