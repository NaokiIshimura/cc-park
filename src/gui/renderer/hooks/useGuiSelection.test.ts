import { describe, expect, it } from 'vitest';
import { toGuiSelectionCommand } from './useGuiSelection.js';

const key = (value: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

describe('toGuiSelectionCommand', () => {
  it.each([
    ['ArrowUp', 'up'],
    ['k', 'up'],
    ['ArrowDown', 'down'],
    ['j', 'down'],
    ['Enter', 'copy'],
    ['c', 'copy'],
    ['r', 'refresh'],
    ['n', 'toggleNotify'],
    ['s', 'requestStop'],
    ['x', 'requestKill'],
    ['t', 'toggleAlwaysOnTop'],
    ['q', 'quit'],
    ['y', 'confirm'],
    ['Escape', 'cancel'],
  ])('%s を %s として扱う', (input, expected) => {
    expect(toGuiSelectionCommand(key(input))).toBe(expected);
  });

  it('割り当ての無い印字文字は other として扱う', () => {
    expect(toGuiSelectionCommand(key('z'))).toBe('other');
  });

  it('装飾キーは無視する', () => {
    expect(toGuiSelectionCommand(key('Shift'))).toBeNull();
    expect(toGuiSelectionCommand(key('Tab'))).toBeNull();
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    '%s 併用時はアプリ・OS のショートカットを横取りしない',
    (modifier) => {
      expect(toGuiSelectionCommand(key('q', { [modifier]: true }))).toBeNull();
    },
  );
});
