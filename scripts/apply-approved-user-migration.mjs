import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { execFileSync } from 'node:child_process';
const expected = '20261004120000_user_permissions';
export async function run({ env = process.env, dbFactory, deploy } = {}) {
  if (!env.VLC_APPLY_USER_PERMISSION_MIGRATION) return;
  if (env.VLC_APPLY_USER_PERMISSION_MIGRATION !== expected || env.VERCEL_ENV !== 'production') throw new Error('Approved migration target is invalid.');
  const target = new URL(env.DATABASE_URL || '');
  if (!target.hostname.endsWith('.neon.tech') || !['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Production database target is invalid.');
  const root = path.resolve(__dirname, '..');
  const migrationRoot = path.join(root, 'prisma/migrations');
  const sql = fs.readFileSync(path.join(migrationRoot, expected, 'migration.sql'), 'utf8').trim();
  if (sql !== 'ALTER TABLE "PortalUser" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT \'{}\';') throw new Error('Approved migration content changed.');
  const db = dbFactory ? dbFactory() : new PrismaClient();
  try {
    const rows = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
    if (rows.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Unresolved migration history.');
    const finished = new Set(rows.filter(row => row.finished_at).map(row => row.migration_name));
    const pending = fs.readdirSync(migrationRoot).filter(name => fs.existsSync(path.join(migrationRoot, name, 'migration.sql')) && !finished.has(name));
    if (pending.some(name => name !== expected)) throw new Error('Unapproved migrations are pending.');
    if (pending.length) {
      if (deploy) await deploy();
      else execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: root, env, stdio: 'pipe', timeout: 90000 });
    }
    const history = await db.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL', expected);
    const column = await db.$queryRawUnsafe('SELECT data_type FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=\'PortalUser\' AND column_name=\'permissions\'');
    if (!history.length || column[0]?.data_type !== 'jsonb') throw new Error('Approved migration verification failed.');
    console.log('Approved user-permissions migration verified: history complete, permissions JSONB present.');
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(() => { console.error('Approved user-permissions migration stopped. No other migrations are authorized.'); process.exitCode = 1; });
