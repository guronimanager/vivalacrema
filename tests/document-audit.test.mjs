import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { loadTypeScript } from './helpers/load-typescript.mjs';
class ArchiveError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function harness(){
 const effects={permissions:[],queries:[],raw:[],deny:false};
 const route=loadTypeScript('src/app/api/documents/audit/route.ts',{
  '@/lib/users/auth':{requirePortal:async module=>{effects.permissions.push(module);if(effects.deny)throw new ArchiveError('Denied',403);}},
  '@/lib/onedrive/security':{ArchiveError,requireSession:async()=>({accountId:'owner'}),failure:error=>Response.json({message:error.message},{status:error.status||500})},
  '@/lib/onedrive/documents':{listDocuments:async()=>[{id:'doc',date:'2026-01-01',archivePeriod:'2026-09',accountId:'owner',pathname:'private'}],publicDocument:({accountId,pathname,...visible})=>{void accountId;void pathname;return visible;}},
  '@/lib/prisma':{prisma:{$transaction:async work=>work({$executeRaw:async strings=>effects.raw.push(strings.join('')),business:{findFirst:async()=>({id:'business'})},transaction:{findMany:async query=>{effects.queries.push(query);return []; }},purchaseInvoice:{findMany:async query=>{effects.queries.push(query);return []; }},expense:{findMany:async query=>{effects.queries.push(query);return []; }}})}},
 });return {route,effects};
}
test('Annual audit is permission-gated and uses read-only transaction with exact fiscal period',async()=>{
 const {route,effects}=harness();
 const response=await route.GET(new Request('https://example.test/api/documents/audit?year=2026'));const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.complete,true);assert.deepEqual(effects.permissions,['archive','bank','expenses']);assert.deepEqual(effects.raw,['SET TRANSACTION READ ONLY']);
 for(const query of effects.queries){assert.equal(query.where.businessId,'business');assert.equal(query.where.date.gte.toISOString(),'2026-01-01T00:00:00.000Z');assert.equal(query.where.date.lt.toISOString(),'2027-01-01T00:00:00.000Z');}
 assert.equal(data.documents[0].accountId,undefined);assert.equal(data.documents[0].pathname,undefined);assert.equal(effects.queries[1].where.accountId,'owner');void Prisma;
});
test('Unauthorized and invalid-year audits fail before any financial query',async()=>{
 const {route,effects}=harness();effects.deny=true;assert.equal((await route.GET(new Request('https://example.test/api?year=2026'))).status,403);assert.equal(effects.queries.length,0);
 effects.deny=false;assert.equal((await route.GET(new Request('https://example.test/api?year=invalid'))).status,400);assert.equal(effects.queries.length,0);
});
