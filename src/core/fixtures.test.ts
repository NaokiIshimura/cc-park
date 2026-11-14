import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RawAgent } from '../types/agent.js';
import { findUnknownInOutput, normalizeAgents } from './normalizeAgent.js';

/**
 * 実際に見た `claude agents --json` の出力を正規化できることを固定する。
 * 出力の形が変わったら `__fixtures__/agents/` にサンプルを足し、ここが通るように直す。
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'agents');

const load = (name: string): RawAgent[] =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as RawAgent[];

const files = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'));

describe('claude agents --json の出力サンプル', () => {
  it('サンプルが 1 つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s はすべての要素を解釈できる', (name) => {
    const raws = load(name);
    const agents = normalizeAgents(raws);

    expect(agents).toHaveLength(raws.length);
    for (const agent of agents) {
      expect(agent.state).not.toBe('unknown');
      expect(agent.kind).not.toBe('unknown');
    }
    expect(findUnknownInOutput(raws)).toEqual([]);
  });

  it('interactive は status、background は state から状態を読む', () => {
    expect(normalizeAgents(load('interactive-busy.json')).map((agent) => agent.state)).toEqual([
      'working',
    ]);
    expect(normalizeAgents(load('background.json')).map((agent) => agent.state)).toEqual([
      'blocked',
      'working',
    ]);
  });
});
