/**
 * README のインストール手順のバージョンを `package.json` の `version` に揃える。
 *
 * `npm version <patch|minor>` の `version` ライフサイクルから自動で呼ばれる。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceDownloadVersion } from '../src/shared/readmeVersion.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(ROOT, 'README.md');

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
writeFileSync(README, replaceDownloadVersion(readFileSync(README, 'utf8'), version));
console.log(`README.md のインストール手順を v${version} に揃えました`);
