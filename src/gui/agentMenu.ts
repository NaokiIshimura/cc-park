/**
 * 一覧の行の右クリックメニュー（通常表示）。
 *
 * メニューは main プロセスが OS のネイティブメニューで出し、選ばれた操作を renderer へ返す。
 * 項目の並びと有効・無効の判断はここに純粋関数で置き、main と renderer の双方から使う。
 */

/** メニューから選べる操作。それぞれ Enter / c / s / x と同じことをする。 */
export type AgentMenuAction = 'open' | 'copy' | 'stop' | 'kill';

/** メニューを出すときに renderer から渡す情報。 */
export interface AgentMenuRequest {
  /** 右クリックしたセッション。選ばれた操作と一緒に返し、どの行への操作かを renderer が引き当てる */
  readonly sessionId: string;
  /** `claude stop` できるか（background セッション） */
  readonly canStop: boolean;
  /** プロセスを kill できるか（PID が分かる interactive セッション） */
  readonly canKill: boolean;
}

/** メニューで選ばれた操作。 */
export interface AgentMenuSelection {
  readonly sessionId: string;
  readonly action: AgentMenuAction;
}

export interface AgentMenuItem {
  readonly action: AgentMenuAction;
  readonly label: string;
  /** 同じ操作のキー。メニューの右端に表示するだけで、メニューから登録はしない */
  readonly accelerator: string;
  readonly enabled: boolean;
  /** この項目の前に区切り線を入れるか */
  readonly separatorBefore: boolean;
}

/** メニューの項目。stop / kill は対象にできないセッションでは無効にして、あることだけは見せる。 */
export const agentMenuItems = (request: AgentMenuRequest): AgentMenuItem[] => [
  { action: 'open', label: '開く', accelerator: 'Enter', enabled: true, separatorBefore: false },
  {
    action: 'copy',
    label: '開くコマンドをコピー',
    accelerator: 'C',
    enabled: true,
    separatorBefore: false,
  },
  {
    action: 'stop',
    label: 'stop…',
    accelerator: 'S',
    enabled: request.canStop,
    separatorBefore: true,
  },
  {
    action: 'kill',
    label: 'kill…',
    accelerator: 'X',
    enabled: request.canKill,
    separatorBefore: false,
  },
];

/** renderer から届いた値をメニューを出す情報として解釈する。使えなければ null。 */
export const toAgentMenuRequest = (value: unknown): AgentMenuRequest | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { sessionId, canStop, canKill } = value as Partial<Record<keyof AgentMenuRequest, unknown>>;
  if (typeof sessionId !== 'string' || sessionId === '') {
    return null;
  }
  return { sessionId, canStop: canStop === true, canKill: canKill === true };
};
