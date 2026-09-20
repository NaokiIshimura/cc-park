import { contextBridge, ipcRenderer } from 'electron';
import type { NotificationPayload } from '../shared/notification.js';
import type { Agent } from '../types/agent.js';
import { IPC_CHANNELS, type CcParkBridge, type FetchAgentsRequest } from './ipc.js';

/**
 * renderer へ公開する API。
 * ロジックは持たせず、IPC の呼び出しへ 1:1 で対応させる。
 */
const bridge: CcParkBridge = {
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getConfig),
  fetchAgents: (request: FetchAgentsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.fetchAgents, request),
  stopAgent: (agent: Agent) => ipcRenderer.invoke(IPC_CHANNELS.stopAgent, agent),
  killAgent: (agent: Agent) => ipcRenderer.invoke(IPC_CHANNELS.killAgent, agent),
  writeClipboard: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.writeClipboard, text),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setAlwaysOnTop, value),
  notify: (payload: NotificationPayload) => {
    ipcRenderer.send(IPC_CHANNELS.notify, payload);
  },
  quit: () => {
    ipcRenderer.send(IPC_CHANNELS.quit);
  },
};

contextBridge.exposeInMainWorld('ccPark', bridge);
