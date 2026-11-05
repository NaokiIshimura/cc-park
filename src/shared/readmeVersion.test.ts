import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDownloadVersions, replaceDownloadVersion } from './readmeVersion.js';

const readRoot = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('readmeVersion', () => {
  it('タグとファイル名の両方のバージョンを置き換える', () => {
    const url = 'https://github.com/o/r/releases/download/v0.1.0/cc-park-0.1.0-darwin-arm64.zip';
    expect(replaceDownloadVersion(url, '0.2.0')).toBe(
      'https://github.com/o/r/releases/download/v0.2.0/cc-park-0.2.0-darwin-arm64.zip',
    );
  });

  it('README のインストール手順は package.json の version を指している', () => {
    // 落ちたら npm version で上げたか、`npm run readme:version` で揃える
    const { version } = JSON.parse(readRoot('package.json')) as { version: string };
    const versions = findDownloadVersions(readRoot('README.md'));
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([version]));
  });
});
