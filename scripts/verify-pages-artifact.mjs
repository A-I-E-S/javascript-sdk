import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../examples/vanilla/dist/', import.meta.url);
const forbidden = [
  'VITE_AFRICANIES_ENCODED_KEY',
  'YOUR_BASE64_ENCODED_TEST_KEY',
  'dGVzdDpjcmVkZW50aWFs',
  'VITE_GOOGLE_MAPS_API_KEY',
];
const forbiddenPatterns = [/AIza[0-9A-Za-z_-]{35}/g];
const configuredBase = process.env.PAGES_BASE_PATH?.trim() ?? '';
const expectedBase = configuredBase === '' || configuredBase === '/'
  ? '/'
  : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

const entryDocuments = await Promise.all(['index.html', 'manual.html'].map(async (name) => ({ name, content: await readFile(new URL(name, root), 'utf8') })));
const assetReferences = entryDocuments.flatMap(({ content }) => [...content.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1]).filter((value) => value.includes('/assets/')));

if (assetReferences.length < 2 || assetReferences.some((value) => !value.startsWith(`${expectedBase}assets/`))) {
  throw new Error(`Pages artifact must reference emitted CSS and JavaScript under ${expectedBase}assets/*; received ${assetReferences.join(', ') || 'none'}.`);
}

if (!entryDocuments[0].content.includes('./manual.html') || !entryDocuments[1].content.includes('./')) {
  throw new Error('Automatic and manual demos must link to each other.');
}

for (const reference of assetReferences) {
  const artifactPath = new URL(relative(expectedBase, reference), root);
  try {
    await access(artifactPath);
  } catch {
    throw new Error(`Pages artifact references a missing file: ${reference}.`);
  }
}

for (const path of await files(root.pathname)) {
  const content = await readFile(path);
  const text = content.toString('utf8');
  for (const secret of forbidden) {
    if (text.includes(secret)) throw new Error(`Pages artifact ${path} contains forbidden credential material: ${secret}.`);
  }
  for (const pattern of forbiddenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) throw new Error(`Pages artifact ${path} contains a Google browser-key-shaped value.`);
  }
}

console.log(`Verified Pages base ${expectedBase}, emitted CSS/JavaScript, and credential absence across ${(await files(root.pathname)).length} files.`);
