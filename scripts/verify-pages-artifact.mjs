import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../examples/vanilla/dist/', import.meta.url);
const forbidden = [
  'VITE_AFRICANIES_ENCODED_KEY',
  'YOUR_BASE64_ENCODED_TEST_KEY',
  'dGVzdDpjcmVkZW50aWFs',
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

const index = await readFile(new URL('index.html', root), 'utf8');
const assetReferences = [...index.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value.includes('/assets/'));

if (assetReferences.length === 0 || assetReferences.some((value) => !value.startsWith('/javascript-sdk/assets/'))) {
  throw new Error(`Pages artifact must reference only /javascript-sdk/assets/*; received ${assetReferences.join(', ') || 'none'}.`);
}

for (const path of await files(root.pathname)) {
  const content = await readFile(path);
  const text = content.toString('utf8');
  for (const secret of forbidden) {
    if (text.includes(secret)) throw new Error(`Pages artifact ${path} contains forbidden credential material: ${secret}.`);
  }
}

console.log(`Verified Pages base path and credential absence across ${(await files(root.pathname)).length} files.`);
