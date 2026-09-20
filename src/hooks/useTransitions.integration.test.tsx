import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Agent, CharacterState } from '../types/agent.js';
import { useTransitions } from './useTransitions.js';

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const agent = (sessionId: string, state: CharacterState): Agent => ({
  sessionId,
  name: sessionId,
  cwd: '/tmp',
  kind: 'interactive',
  startedAt: 0,
  state,
  rawState: state,
  pid: undefined,
  id: undefined,
});

interface HarnessProps {
  readonly agents: readonly Agent[];
  readonly previousAgents: readonly Agent[] | null;
  readonly highlightMs?: number;
  readonly now: number;
}

const Harness = ({ agents, previousAgents, highlightMs, now }: HarnessProps) => {
  const result = useTransitions(agents, previousAgents, {
    ...(highlightMs === undefined ? {} : { highlightMs }),
    now,
  });
  return (
    <Text>
      {JSON.stringify({
        states: result.agents.map((item) => [item.sessionId, item.state]),
        transitions: result.transitions.map((item) => [item.sessionId, item.from, item.to]),
      })}
    </Text>
  );
};

const parse = (frame: string | undefined) =>
  JSON.parse(frame ?? '{}') as {
    states: [string, CharacterState][];
    transitions: [string, CharacterState | null, CharacterState][];
  };

describe('useTransitions', () => {
  it('初回は遷移を検出しない', async () => {
    const { lastFrame, unmount } = render(
      <Harness agents={[agent('a', 'waiting')]} previousAgents={null} now={Date.now()} />,
    );
    await wait();
    expect(parse(lastFrame()).transitions).toEqual([]);
    unmount();
  });

  it('working -> waiting を検出して justFinished にする', async () => {
    const { lastFrame, rerender, unmount } = render(
      <Harness agents={[agent('a', 'working')]} previousAgents={null} now={Date.now()} />,
    );
    await wait();

    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'working')]}
        now={Date.now()}
      />,
    );
    await wait();

    const state = parse(lastFrame());
    expect(state.transitions).toEqual([['a', 'working', 'waiting']]);
    expect(state.states).toEqual([['a', 'justFinished']]);
    unmount();
  });

  it('ハイライト期限を過ぎたら waiting へ戻る', async () => {
    const { lastFrame, rerender, unmount } = render(
      <Harness agents={[agent('a', 'working')]} previousAgents={null} now={Date.now()} />,
    );
    await wait();

    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'working')]}
        highlightMs={20}
        now={Date.now()}
      />,
    );
    await wait(60);

    // 次のポーリングでは遷移が無い（前回も waiting）ため、期限切れで waiting へ戻る
    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'waiting')]}
        highlightMs={20}
        now={Date.now()}
      />,
    );
    await wait();

    expect(parse(lastFrame()).states).toEqual([['a', 'waiting']]);
    unmount();
  });

  it('再び作業を始めたらハイライトを解除する', async () => {
    const { lastFrame, rerender, unmount } = render(
      <Harness agents={[agent('a', 'working')]} previousAgents={null} now={Date.now()} />,
    );
    await wait();

    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'working')]}
        now={Date.now()}
      />,
    );
    await wait();
    expect(parse(lastFrame()).states).toEqual([['a', 'justFinished']]);

    rerender(
      <Harness
        agents={[agent('a', 'working')]}
        previousAgents={[agent('a', 'waiting')]}
        now={Date.now()}
      />,
    );
    await wait();
    expect(parse(lastFrame()).states).toEqual([['a', 'working']]);

    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'working'), agent('dummy', 'waiting')]}
        now={Date.now()}
      />,
    );
    await wait();
    expect(parse(lastFrame()).states).toEqual([['a', 'justFinished']]);
    unmount();
  });

  it('消滅したセッションの記録を持ち越さない', async () => {
    const { lastFrame, rerender, unmount } = render(
      <Harness agents={[agent('a', 'working')]} previousAgents={null} now={Date.now()} />,
    );
    await wait();

    rerender(
      <Harness
        agents={[agent('a', 'waiting')]}
        previousAgents={[agent('a', 'working')]}
        now={Date.now()}
      />,
    );
    await wait();

    // a が消えたあとに同じ sessionId が再登場しても justFinished にならない
    rerender(<Harness agents={[]} previousAgents={[agent('a', 'waiting')]} now={Date.now()} />);
    await wait();

    rerender(
      <Harness agents={[agent('a', 'waiting')]} previousAgents={[]} now={Date.now()} />,
    );
    await wait();

    expect(parse(lastFrame()).states).toEqual([['a', 'waiting']]);
    unmount();
  });
});
