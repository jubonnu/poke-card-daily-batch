#!/usr/bin/env node

import { runBatch } from './batch/index.js';

/**
 * コマンドライン引数から --key value 形式のオプションを取得
 * @param {string[]} args - process.argv.slice(2)
 * @param {string} key - オプション名（例: '--type'）
 * @returns {string | undefined}
 */
function getArg(args, key) {
  const idx = args.indexOf(key);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const type = getArg(args, '--type') ?? 'full';
  const mode = getArg(args, '--mode');

  try {
    await runBatch(type, { mode });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
