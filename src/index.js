#!/usr/bin/env node

import { runBatch } from './batch/index.js';

async function main() {
  const args = process.argv.slice(2);
  const typeIndex = args.indexOf('--type');
  const type = typeIndex >= 0 && args[typeIndex + 1]
    ? args[typeIndex + 1]
    : 'full';

  try {
    await runBatch(type);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
