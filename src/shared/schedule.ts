/**
 * 予約（選んだ曜日のきまった時刻に Claude Code を起動する設定）の型と判断ロジック。
 *
 * ファイル入出力とプロセス起動は core 側に持たせ、ここには計算だけを置く。
 * main プロセス・renderer のどちらから呼んでも同じ結果になるよう、`node:*` に依存しない。
 */

/** 曜日。`Date#getDay` と同じく 0 が日曜、6 が土曜。 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** すべての曜日（毎日）。 */
export const ALL_WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** 画面に並べる順。月曜始まりにする（平日・土日がまとまって見える）。 */
export const WEEKDAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** 曜日の 1 文字表記。 */
export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};

/** 予約 1 件。時刻はローカル時刻で、選んだ曜日にくり返す。 */
export interface Schedule {
  readonly id: string;
  /** `HH:MM`（24 時間表記・ローカル時刻） */
  readonly time: string;
  /**
   * 起動する曜日。未指定なら毎日（曜日を選べるようになる前の予約との互換のため）。
   * 空にはしない（検証で弾く）
   */
  readonly days?: readonly Weekday[];
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

/** 入力フォームから受け取る項目。 */
export interface ScheduleInput {
  readonly time: string;
  /** 起動する曜日。未指定なら毎日 */
  readonly days?: readonly Weekday[];
  readonly cwd: string;
  readonly prompt: string;
}

/** 項目ごとの検証エラー文言。問題のない項目は持たない。 */
export interface ScheduleFieldErrors {
  readonly time?: string;
  readonly days?: string;
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

/** 曜日として使える値か。 */
export const isWeekday = (value: unknown): value is Weekday =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

/** 重複を除き、日曜始まりの順に揃える（保存・比較を安定させる）。 */
export const normalizeWeekdays = (days: readonly Weekday[]): Weekday[] =>
  ALL_WEEKDAYS.filter((day) => days.includes(day));

/** 平日（月〜金）。 */
export const WEEKDAYS_ONLY: readonly Weekday[] = [1, 2, 3, 4, 5];

/** 繰り返しの選び方。`custom` は曜日を 1 つずつ選ぶ。 */
export type RepeatMode = 'daily' | 'weekdays' | 'custom';

/** 画面に並べる順と表記。 */
export const REPEAT_MODES: readonly RepeatMode[] = ['daily', 'weekdays', 'custom'];
export const REPEAT_MODE_LABELS: Readonly<Record<RepeatMode, string>> = {
  daily: '毎日',
  weekdays: '平日',
  custom: '曜日指定',
};

const sameDays = (a: readonly Weekday[], b: readonly Weekday[]): boolean =>
  normalizeWeekdays(a).join(',') === normalizeWeekdays(b).join(',');

/** 曜日から繰り返しの選び方を決める。毎日・平日に当たらなければ曜日指定。 */
export const repeatModeOf = (days: readonly Weekday[]): RepeatMode => {
  if (sameDays(days, ALL_WEEKDAYS)) {
    return 'daily';
  }
  if (sameDays(days, WEEKDAYS_ONLY)) {
    return 'weekdays';
  }
  return 'custom';
};

/** 選び方から起動する曜日を決める。曜日指定のときは選んだ曜日をそのまま使う。 */
export const daysForRepeatMode = (
  mode: RepeatMode,
  customDays: readonly Weekday[],
): readonly Weekday[] => {
  switch (mode) {
    case 'daily':
      return ALL_WEEKDAYS;
    case 'weekdays':
      return WEEKDAYS_ONLY;
    case 'custom':
      return customDays;
  }
};

/** 予約が起動する曜日。未指定なら毎日。 */
export const scheduleDays = (schedule: Pick<Schedule, 'days'>): readonly Weekday[] =>
  schedule.days ?? ALL_WEEKDAYS;

/** 項目を検証する。cwd は `normalizeCwd` を通した後の値を渡す。 */
export const validateSchedule = (input: ScheduleInput): ValidateScheduleResult => {
  const errors: {
    time?: string;
    days?: string;
    cwd?: string;
    prompt?: string;
  } = {};

  if (parseTime(input.time) === null) {
    errors.time = '時刻は HH:MM の形式で入力してください。';
  }

  if (input.days !== undefined && input.days.length === 0) {
    errors.days = '曜日を 1 つ以上選んでください。';
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
  // 毎日なら持たない（未指定と同じ意味。保存ファイルを曜日を選べる前の形のままにする）
  ...(input.days === undefined || normalizeWeekdays(input.days).length === ALL_WEEKDAYS.length
    ? {}
    : { days: normalizeWeekdays(input.days) }),
  cwd: input.cwd.trim(),
  prompt: input.prompt.trim(),
  enabled: true,
  lastFiredAt: null,
});

/**
 * 次に発火する時刻（`now` より後）。
 *
 * 「今日の指定時刻」から 1 日ずつ進め、起動する曜日に当たった最初の日を返す。
 * 翌日は `+ 24 時間` ではなく日付を 1 つ進めて求める（夏時間のある地域で 1 時間ずれないようにする）。
 */
export const nextFireAt = (
  schedule: Pick<Schedule, 'time' | 'days'>,
  now: number,
): number | null => {
  const parsed = parseTime(schedule.time);
  const days = scheduleDays(schedule);
  if (parsed === null || days.length === 0) {
    return null;
  }

  const at = new Date(now);
  at.setHours(parsed.hour, parsed.minute, 0, 0);
  // 今日の時刻が過ぎていても、来週の同じ曜日までの 8 日を見れば必ず当たる
  for (let offset = 0; offset <= 7; offset += 1) {
    if (at.getTime() > now && days.includes(at.getDay() as Weekday)) {
      return at.getTime();
    }
    at.setDate(at.getDate() + 1);
  }
  return null;
};

/** 直近に過ぎた発火時刻（`now` ちょうどを含む）。起動する曜日だけを数える。 */
export const previousFireAt = (
  schedule: Pick<Schedule, 'time' | 'days'>,
  now: number,
): number | null => {
  const parsed = parseTime(schedule.time);
  const days = scheduleDays(schedule);
  if (parsed === null || days.length === 0) {
    return null;
  }

  const at = new Date(now);
  at.setHours(parsed.hour, parsed.minute, 0, 0);
  for (let offset = 0; offset <= 7; offset += 1) {
    if (at.getTime() <= now && days.includes(at.getDay() as Weekday)) {
      return at.getTime();
    }
    at.setDate(at.getDate() - 1);
  }
  return null;
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

/** 日付だけを比べるための通し日数（ローカル時刻）。 */
const dayNumber = (time: number): number => {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
};

/** 次回発火の表示文言。今日・明日、それより先は曜日で示す（1 週間以内に必ず来る）。 */
export const formatNextFire = (schedule: Schedule, now: number): string => {
  if (!schedule.enabled) {
    return '停止中';
  }

  const at = nextFireAt(schedule, now);
  if (at === null) {
    return '-';
  }

  const days = dayNumber(at) - dayNumber(now);
  const when =
    days === 0
      ? '今日'
      : days === 1
        ? '明日'
        : `${WEEKDAY_LABELS[new Date(at).getDay() as Weekday]}曜`;
  return `${when} ${schedule.time}`;
};

/**
 * 起動する曜日の表示文言。毎日・平日・土日はまとめて呼び、それ以外は月曜始まりで並べる（`月・水・金`）。
 */
export const formatWeekdays = (schedule: Pick<Schedule, 'days'>): string => {
  const days = normalizeWeekdays(scheduleDays(schedule));
  const key = days.join(',');
  if (days.length === ALL_WEEKDAYS.length) {
    return '毎日';
  }
  if (key === '1,2,3,4,5') {
    return '平日';
  }
  if (key === '0,6') {
    return '土日';
  }
  return WEEKDAY_ORDER.filter((day) => days.includes(day))
    .map((day) => WEEKDAY_LABELS[day])
    .join('・');
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
