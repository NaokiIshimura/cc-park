/**
 * 予約（毎日きまった時刻に Claude Code を起動する設定）の型と判断ロジック。
 *
 * ファイル入出力とプロセス起動は core 側に持たせ、ここには計算だけを置く。
 * main プロセス・renderer・TUI のどこから呼んでも同じ結果になるよう、`node:*` に依存しない。
 */

/** 予約 1 件。時刻はローカル時刻で、毎日くり返す。 */
export interface Schedule {
  readonly id: string;
  /** `HH:MM`（24 時間表記・ローカル時刻） */
  readonly time: string;
  /** 起動するディレクトリ。絶対パス */
  readonly cwd: string;
  /** 起動時に渡すプロンプト */
  readonly prompt: string;
  readonly enabled: boolean;
  /**
   * 直近に発火した「予定時刻」。実際に起動した時刻ではない。
   *
   * ティックの間隔と予定時刻はずれるため、実行時刻で持つと
   * 同じ予定を二度起動したかどうかを判定できない。
   */
  readonly lastFiredAt: number | null;
}

/** 入力フォームから受け取る 3 項目。 */
export interface ScheduleInput {
  readonly time: string;
  readonly cwd: string;
  readonly prompt: string;
}

/** 項目ごとの検証エラー文言。問題のない項目は持たない。 */
export interface ScheduleFieldErrors {
  readonly time?: string;
  readonly cwd?: string;
  readonly prompt?: string;
}

export type ValidateScheduleResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ScheduleFieldErrors };

/** `HH:MM` を時と分へ分解する。形式が合わなければ null。 */
export const parseTime = (value: string): { hour: number; minute: number } | null => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (matched === null) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
};

/** `9:05` のような入力を `09:05` へ揃える。解釈できなければ元の文字列を返す。 */
export const normalizeTime = (value: string): string => {
  const parsed = parseTime(value);
  if (parsed === null) {
    return value.trim();
  }
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
};

/**
 * 入力されたディレクトリを絶対パスへ揃える。
 * 先頭の `~` だけを展開する（シェルを経由しないため展開は自前で行う）。
 */
export const normalizeCwd = (cwd: string, home: string): string => {
  const trimmed = cwd.trim().replace(/\/+$/, '');
  if (trimmed === '~') {
    return home;
  }
  if (trimmed.startsWith('~/') && home !== '') {
    return `${home}${trimmed.slice(1)}`;
  }
  return trimmed;
};

/** 3 項目を検証する。cwd は `normalizeCwd` を通した後の値を渡す。 */
export const validateSchedule = (input: ScheduleInput): ValidateScheduleResult => {
  const errors: {
    time?: string;
    cwd?: string;
    prompt?: string;
  } = {};

  if (parseTime(input.time) === null) {
    errors.time = '時刻は HH:MM の形式で入力してください。';
  }

  const cwd = input.cwd.trim();
  if (cwd === '') {
    errors.cwd = 'ディレクトリを入力してください。';
  } else if (!cwd.startsWith('/')) {
    errors.cwd = 'ディレクトリは絶対パス（/ 始まり）で入力してください。';
  }

  if (input.prompt.trim() === '') {
    errors.prompt = 'プロンプトを入力してください。';
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
};

/**
 * 予約の ID を発番する。
 * `crypto.randomUUID` が使えない実行環境でも動くよう、時刻と乱数で補う。
 */
export const createScheduleId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 検証済みの入力から予約を組み立てる。ID の発番は呼び出し側に任せる。 */
export const createSchedule = (input: ScheduleInput, id: string): Schedule => ({
  id,
  time: normalizeTime(input.time),
  cwd: input.cwd.trim(),
  prompt: input.prompt.trim(),
  enabled: true,
  lastFiredAt: null,
});

/**
 * 次に発火する時刻。
 *
 * 「今日の指定時刻」が過ぎていれば翌日へ送る。翌日は `+ 24 時間` ではなく
 * 日付を 1 つ進めて求める（夏時間のある地域で 1 時間ずれないようにする）。
 */
export const nextFireAt = (schedule: Pick<Schedule, 'time'>, now: number): number | null => {
  const parsed = parseTime(schedule.time);
  if (parsed === null) {
    return null;
  }

  const at = new Date(now);
  at.setHours(parsed.hour, parsed.minute, 0, 0);
  if (at.getTime() <= now) {
    at.setDate(at.getDate() + 1);
  }
  return at.getTime();
};

/** 直近に過ぎた発火時刻（`now` ちょうどを含む）。 */
export const previousFireAt = (schedule: Pick<Schedule, 'time'>, now: number): number | null => {
  const parsed = parseTime(schedule.time);
  if (parsed === null) {
    return null;
  }

  const at = new Date(now);
  at.setHours(parsed.hour, parsed.minute, 0, 0);
  if (at.getTime() > now) {
    at.setDate(at.getDate() - 1);
  }
  return at.getTime();
};

/**
 * 発火すべきかを判定し、発火する「予定時刻」を返す。不要なら null。
 *
 * 時刻の一致ではなく `since` から `now` までの区間を跨いだかで判定する。
 * ティックがスリープや負荷でずれても取りこぼさず、`lastFiredAt` と突き合わせるので
 * 同じ予定を二度起動することもない。
 */
export const dueFireAt = (schedule: Schedule, now: number, since: number): number | null => {
  if (!schedule.enabled) {
    return null;
  }

  const at = previousFireAt(schedule, now);
  if (at === null || at <= since || at === schedule.lastFiredAt) {
    return null;
  }
  return at;
};

/** 次回発火の表示文言。毎日くり返すので今日か明日のどちらかになる。 */
export const formatNextFire = (schedule: Schedule, now: number): string => {
  if (!schedule.enabled) {
    return '停止中';
  }

  const at = nextFireAt(schedule, now);
  if (at === null) {
    return '-';
  }

  const isToday = new Date(at).getDate() === new Date(now).getDate();
  return `${isToday ? '今日' : '明日'} ${schedule.time}`;
};

/** 時刻の早い順に並べる。同時刻は ID で安定させる。 */
export const sortSchedules = (schedules: readonly Schedule[]): Schedule[] =>
  [...schedules].sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));

/** 同じ ID があれば置き換え、無ければ末尾へ足す。 */
export const upsertSchedule = (
  schedules: readonly Schedule[],
  schedule: Schedule,
): Schedule[] =>
  schedules.some((current) => current.id === schedule.id)
    ? schedules.map((current) => (current.id === schedule.id ? schedule : current))
    : [...schedules, schedule];

/** ID で 1 件取り除く。 */
export const removeSchedule = (schedules: readonly Schedule[], id: string): Schedule[] =>
  schedules.filter((schedule) => schedule.id !== id);
