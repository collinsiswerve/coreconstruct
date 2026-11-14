import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { readRecoveryArchive, restoreRecoveryArchive } from '../lib/recovery.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [archivePath, targetDirectory, ownerId, email, name, ...extras] = args;
  if (!archivePath || !targetDirectory || !ownerId || !email || !name || extras.length) {
    throw new Error('Usage: pnpm run recover -- ARCHIVE.zip NEW_DIRECTORY OWNER_ID EMAIL "OWNER NAME"');
  }
  const source = await stat(archivePath);
  if (!source.isFile() || source.size > 25 * 1024 * 1024) throw new Error('Choose a CoreConstruct recovery ZIP under 25 MB.');
  const archive = await readRecoveryArchive(await readFile(archivePath));
  const configPath = resolve('dist/server/wrangler.json');
  await stat(configPath);
  const path = resolve(targetDirectory);
  await mkdir(path, { mode: 0o700 });
  const proxy = await getPlatformProxy({ configPath, persist: { path }, remoteBindings: false, envFiles: [] });
  try {
    const { DB, BUCKET } = proxy.env;
    if (!DB || !BUCKET) throw new Error('Build the workspace with its D1 and R2 bindings before restoring.');
    const migrations = (await readdir('drizzle')).filter(file => file.endsWith('.sql')).sort();
    for (const migration of migrations) {
      const sql = await readFile(resolve('drizzle', migration), 'utf8');
      const statements = sql.split('--> statement-breakpoint').map(statement => DB.prepare(statement.trim()));
      await DB.batch(statements);
    }
    const result = await restoreRecoveryArchive(DB, BUCKET, { id: ownerId, email, name }, archive);
    console.log(`Restored workspace version ${result.version}, ${result.projects} project(s) and ${result.files} verified attachment(s).`);
    console.log(`Local recovery storage: ${path}`);
  } finally {
    await proxy.dispose();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Recovery failed.');
  process.exitCode = 1;
});
