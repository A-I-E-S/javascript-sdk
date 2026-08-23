import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'africanies-packed-consumer-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = {
  ...process.env,
  npm_config_cache: join(temporaryDirectory, 'npm-cache'),
};

async function execute(command, args, options = {}) {
  try {
    return await run(command, args, {
      env: environment,
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

try {
  const { stdout } = await execute(npmCommand, [
    'pack',
    '--json',
    '--pack-destination',
    temporaryDirectory,
  ]);
  const [{ filename }] = JSON.parse(stdout);
  const consumerDirectory = join(temporaryDirectory, 'consumer');
  const tarballPath = join(temporaryDirectory, filename);

  await execute(npmCommand, [
    'install',
    '--prefix',
    consumerDirectory,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    tarballPath,
  ]);

  const smokeTest = `
    await import('@africanies/shipping');
    await import('@africanies/shipping/server');
    await import('@africanies/shipping/ui');
    globalThis.HTMLElement = class {};
    await import('@africanies/shipping/elements');
    globalThis.customElements = { get() {}, define() {} };
    await import('@africanies/shipping/browser');
    const packageMetadata = await import('@africanies/shipping/package.json', { with: { type: 'json' } });
    if (packageMetadata.default.name !== '@africanies/shipping') {
      throw new Error('Packed package metadata has an unexpected package name.');
    }
  `;

  await execute(process.execPath, ['--input-type=module', '--eval', smokeTest], {
    cwd: consumerDirectory,
  });
  process.stdout.write(`Packed consumer verified: ${filename}\n`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
