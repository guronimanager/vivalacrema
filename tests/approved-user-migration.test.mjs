import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { run } from '../scripts/apply-approved-user-migration.mjs';
const expected='20261004120000_user_permissions';
const env={VLC_APPLY_USER_PERMISSION_MIGRATION:expected,VERCEL_ENV:'production',DATABASE_URL:'postgresql://db.example.neon.tech/fixture'};
const names=fs.readdirSync('prisma/migrations').filter(name=>fs.existsSync(`prisma/migrations/${name}/migration.sql`));
test('Normal builds never open a database or execute migrations',async()=>{
 await run({env:{},dbFactory:()=>{throw new Error('Should not connect');}});
 for(const invalid of [{...env,VERCEL_ENV:'preview'},{...env,VLC_APPLY_USER_PERMISSION_MIGRATION:'other'},{...env,DATABASE_URL:'postgresql://localhost/fixture'}]) await assert.rejects(()=>run({env:invalid}));
});
test('Any unapproved pending migration prevents deployment of migrations',async()=>{
 let deployed=false;
 await assert.rejects(()=>run({env,dbFactory:()=>({$queryRawUnsafe:async()=>[],$disconnect:async()=>{}}),deploy:async()=>{deployed=true;}}),/Unapproved/);
 assert.equal(deployed,false);
});
test('Only the approved migration is applied and verified; repeating it performs no writes',async()=>{
 let applied=false,count=0;
 const db={
  $queryRawUnsafe:async sql=>{
   if(sql.includes('information_schema'))return [{data_type:'jsonb'}];
   if(sql.includes('WHERE migration_name'))return applied?[{migration_name:expected}]:[];
   return names.filter(name=>applied||name!==expected).map(migration_name=>({migration_name,finished_at:new Date(),rolled_back_at:null}));
  },$disconnect:async()=>{},
 };
 const options={env,dbFactory:()=>db,deploy:async()=>{count++;applied=true;}};
 await run(options);await run(options);assert.equal(count,1);
});
