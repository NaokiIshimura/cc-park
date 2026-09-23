import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ScheduleFiredEvent } from '../core/scheduler.js';
import type { NotificationPayload } from '../shared/notification.js';
import type { Schedule } from '../shared/schedule.js';
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
  listSchedules: () => ipcRenderer.invoke(IPC_CHANNELS.listSchedules),
  saveSchedule: (schedule: Schedule) => ipcRenderer.invoke(IPC_CHANNELS.saveSchedule, schedule),
  deleteSchedule: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deleteSchedule, id),
  setScheduleEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setScheduleEnabled, id, enabled),
  onScheduleFired: (listener: (event: ScheduleFiredEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: ScheduleFiredEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.scheduleFired, handler);
    // renderer 側の useEffect で解除できるよう、解除関数を返す
    return () => {
      ipcRenderer.off(IPC_CHANNELS.scheduleFired, handler);
    };
  },
  notify: (payload: NotificationPayload) => {
    ipcRenderer.send(IPC_CHANNELS.notify, payload);
  },
  quit: () => {
    ipcRenderer.send(IPC_CHANNELS.quit);
  },
};

contextBridge.exposeInMainWorld('ccPark', bridge);
