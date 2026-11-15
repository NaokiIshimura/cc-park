import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRoot = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('README のインストール手順', () => {
  const readme = readRoot('README.md');

  it('バージョンを固定せず、常に最新のリリースを取得する', () => {
    const urls = readme.match(/https:\/\/github\.com\/\S+\.zip/g) ?? [];
    expect(urls).toEqual([
      'https://github.com/NaokiIshimura/cc-park/releases/latest/download/cc-park-darwin-arm64.zip',
      'https://github.com/NaokiIshimura/cc-park/releases/latest/download/cc-park-darwin-x64.zip',
    ]);
  });

  it('取得するファイル名を、リリースのワークフローが添えている', () => {
    // releases/latest/download/ はアセット名が固定でないと辿れない
    expect(readRoot('.github/workflows/release.yml')).toContain('"artifacts/cc-park-darwin-${arch}.zip"');
  });
});
