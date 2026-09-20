import { describe, expect, it, vi } from 'vitest';
import type { FetchAgentsResult } from '../../core/fetchAgents.js';
import type { CcParkBridge } from '../ipc.js';
import { createBridgeFetcher } from './bridge.js';

const emptyResult: FetchAgentsResult = { ok: true, agents: [] };

const bridgeWith = (fetchAgents: CcParkBridge['fetchAgents']): CcParkBridge =>
  ({ fetchAgents }) as CcParkBridge;

describe('createBridgeFetcher', () => {
  it('all と cwd をそのまま渡す', async () => {
    const fetchAgents = vi.fn(async () => emptyResult);
    const fetcher = createBridgeFetcher(bridgeWith(fetchAgents));

    await fetcher({ all: true, cwd: '/tmp/x' });

    expect(fetchAgents).toHaveBeenCalledWith({ all: true, cwd: '/tmp/x' });
  });

  it('all の既定値は false', async () => {
    const fetchAgents = vi.fn(async () => emptyResult);
    const fetcher = createBridgeFetcher(bridgeWith(fetchAgents));

    await fetcher({});

    expect(fetchAgents).toHaveBeenCalledWith({ all: false, cwd: undefined });
  });

  it('IPC を越えられない signal は渡さない', async () => {
    const received: unknown[] = [];
    const fetcher = createBridgeFetcher(
      bridgeWith(async (request) => {
        received.push(request);
        return emptyResult;
      }),
    );

    await fetcher({ signal: new AbortController().signal });

    expect(received[0]).not.toHaveProperty('signal');
  });

  it('取得結果をそのまま返す', async () => {
    const fetcher = createBridgeFetcher(bridgeWith(async () => emptyResult));
    await expect(fetcher({})).resolves.toEqual(emptyResult);
  });
});
