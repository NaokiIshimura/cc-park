import type { Agent, AgentKind, CharacterState, RawAgent } from '../types/agent.js';

/**
 * 生の状態文字列 → CharacterState のマッピング。
 *
 * `interactive` は `status`、`background` は `state` とキー名が異なるが、
 * 値自体は衝突しないため 1 つの表で両方を扱う。
 * `background` の `status`（`waiting` など）は `state` より粗いので表に載せない。
 */
const STATE_MAP: Readonly<Record<string, CharacterState>> = {
  // interactive
  busy: 'working',
  idle: 'waiting',
  // background
  running: 'working',
  working: 'working',
  queued: 'working',
  blocked: 'blocked',
  done: 'done',
  completed: 'done',
  stopped: 'stopped',
  failed: 'stopped',
  cancelled: 'stopped',
};

const KINDS: readonly AgentKind[] = ['interactive', 'background'];

const toKind = (kind: string | undefined): AgentKind =>
  KINDS.find((candidate) => candidate === kind) ?? 'unknown';

/**
 * 生の状態文字列を CharacterState へ変換する。
 * 未知の値は握り潰さず 'unknown' にフォールバックする。
 */
export const toCharacterState = (rawState: string): CharacterState =>
  STATE_MAP[rawState.toLowerCase()] ?? 'unknown';

/**
 * RawAgent を Agent へ正規化する。
 * 必須フィールド（sessionId）を欠く要素は null を返して呼び出し側で除外させる。
 */
export const normalizeAgent = (raw: RawAgent): Agent | null => {
  if (typeof raw.sessionId !== 'string' || raw.sessionId === '') {
    return null;
  }

  // kind で分岐せず、存在する方のキーを採用する（仕様変更への耐性を持たせる）。
  // background は status（waiting）と state（blocked）の両方を持つので、より詳しい state を優先する。
  // state が未知の値でも status が分かれば、そちらで表示する
  const candidates = [raw.state, raw.status].filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
  const rawState =
    candidates.find((value) => toCharacterState(value) !== 'unknown') ?? candidates[0] ?? '';

  return {
    sessionId: raw.sessionId,
    name: raw.name ?? raw.sessionId.slice(0, 8),
    cwd: raw.cwd ?? '',
    kind: toKind(raw.kind),
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
    state: rawState === '' ? 'unknown' : toCharacterState(rawState),
    rawState,
    pid: raw.pid,
    id: raw.id,
    // transcript 由来の付加情報は fetchAgents が後から合成する
    meta: undefined,
  };
};

/** RawAgent の配列を正規化し、不正な要素を取り除く。 */
export const normalizeAgents = (raws: readonly RawAgent[]): Agent[] =>
  raws
    .map((raw) => normalizeAgent(raw))
    .filter((agent): agent is Agent => agent !== null);
