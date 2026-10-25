// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompact } from './useCompact.js';

afterEach(cleanup);

const setup = (compact: boolean) => {
  const bridge = { setCompact: vi.fn(async (value: boolean) => value) };
  const result = renderHook((props: { compact: boolean }) => useCompact({ bridge, ...props }), {
    initialProps: { compact },
  });
  return { ...result, bridge };
};

describe('useCompact', () => {
  it('測った大きさで畳む依頼を main へ送る', () => {
    const { result, bridge } = setup(true);
    act(() => {
      result.current.reportSize({ width: 120, height: 80 });
    });
    expect(bridge.setCompact).toHaveBeenCalledWith(true, { width: 120, height: 80 });
  });

  it('畳んでいなければ、戻す依頼は送らない', () => {
    const { rerender, bridge } = setup(false);
    rerender({ compact: false });
    expect(bridge.setCompact).not.toHaveBeenCalled();
  });

  it('畳んだあとに通常表示へ戻すときは、戻す依頼を 1 回だけ送る', () => {
    const { result, rerender, bridge } = setup(true);
    act(() => {
      result.current.reportSize({ width: 120, height: 80 });
    });
    rerender({ compact: false });
    rerender({ compact: false });
    expect(bridge.setCompact).toHaveBeenLastCalledWith(false, null);
    expect(bridge.setCompact).toHaveBeenCalledTimes(2);
  });
});
