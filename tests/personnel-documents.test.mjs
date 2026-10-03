import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/load-typescript.mjs';
class ArchiveError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const security = { ArchiveError, unseal: raw => JSON.parse(raw), allowedEmail: () => 'owner@example.test', failure: error => Response.json({ message: error.message }, { status: error.status || 502 }) };
const business = { id: 'business-1' };
const employee = { id: 'employee-1', businessId: business.id, name: 'Personel A', active: true };
const user = { id: 'user-1', businessId: business.id, employeeId: employee.id, employee, email: 'staff@example.test', role: 'STAFF', accessState: 'ACTIVE', updatedAt: new Date('2026-10-03T10:00:00Z') };
const metadata = { kind:'EMPLOYEE', employeeId:employee.id, entity:'wrong name', date:'2026-10-01', originalName:'bordro.pdf' };
const ownDoc = { ...metadata, id:'a'.repeat(64), pathname:'private-file', accountId:'owner-account', oneDrivePath:'private-archive-path', size:12, contentType:'application/pdf', syncStatus:'SYNCED' };
const otherDoc = { ...ownDoc, id:'b'.repeat(64), employeeId:'employee-2' };
const legacyDoc = { ...ownDoc, id:'c'.repeat(64), employeeId:undefined };
const nonEmployeeDoc = { ...ownDoc, id:'d'.repeat(64), kind:'TAX' };
const documents = [ownDoc,otherDoc,legacyDoc,nonEmployeeDoc];
const db = {
 business: { findFirst:async () => business },
 employee: { findFirst:async ({where}) => where.id === employee.id && where.businessId === business.id ? employee : null },
 portalUser: {
  findFirst:async ({where}) => where.id === user.id && where.businessId === business.id && where.role === user.role && where.accessState === user.accessState ? user : null,
  findMany:async ({where}) => where.businessId === business.id && where.role === user.role && where.accessState === user.accessState && where.email.in.includes(user.email) ? [{id:user.id}] : [],
 },
};
function sessionModule(raw, prisma=db, msal) {
 return loadTypeScript('src/lib/personnel/session.ts', {
  'next/headers': { cookies:async () => ({ get: () => raw ? {value:typeof raw==='string'?raw:JSON.stringify(raw)}:undefined }) },
  '@/lib/prisma': {prisma}, '@/lib/onedrive/security': security,
  '@/lib/onedrive/connection': {msal}, './clerk': {clerkEmployee:async()=>null},
 });
}
function sessionValue(overrides={}) { return {userId:user.id, employeeId:employee.id, email:user.email, version:user.updatedAt.toISOString(), accountId:'staff-account', expiresAt:Date.now()+60000, ...overrides}; }
test('Employee sessions validate current access, mapping, expiry and account version on every request',async () => {
 assert.deepEqual(await sessionModule(sessionValue()).requireEmployeeSession(), {employeeId:employee.id,name:employee.name});
 for(const value of [null,'invalid', sessionValue({expiresAt:0}), sessionValue({employeeId:'employee-2'}),sessionValue({email:'other@example.test'}),sessionValue({version:'old'}),sessionValue({userId:'unknown'})]) await assert.rejects(() => sessionModule(value).requireEmployeeSession(),ArchiveError);
 for(const override of [{accessState:'PLANNED'},{role:'ADMIN'},{employee:{...employee,active:false}},{employee:{...employee,businessId:'different'}}]) {
  const original = {...user};Object.assign(user,override);
  try {await assert.rejects(() => sessionModule(sessionValue()).requireEmployeeSession(),ArchiveError);}finally {Object.assign(user,original);}
 }
});
test('Microsoft staff login uses identity-only scopes and refuses unlisted or ambiguous users',async () => {
 const previousFetch = globalThis.fetch;
 globalThis.fetch = async () => Response.json({mail:user.email});
 const fakeMsal = () => ({ acquireTokenByCode: async ({scopes}) => { assert.deepEqual(scopes,['https://graph.microsoft.com/User.Read']);return { account:{homeAccountId:'staff-account',username:user.email},accessToken:'test-only-token' }; } });
 try {
  const value=await sessionModule(null,db,fakeMsal).finishEmployeeLogin('test-code','test-verifier');
  assert.equal(value.userId,user.id);assert.equal(value.employeeId,employee.id);
  for(const matches of [[],[{id:user.id},{id:'user-2'}]]) {
   const altered={...db,portalUser:{...db.portalUser,findMany:async()=>matches}};
   await assert.rejects(() => sessionModule(null,altered,fakeMsal).finishEmployeeLogin('test-code','test-verifier'),ArchiveError);
  }
 } finally {globalThis.fetch=previousFetch;}
});
test('Personnel metadata requires a real employee in the current business; no name-based ownership',async () => {
 const api=loadTypeScript('src/lib/personnel/documents.ts',{'@/lib/prisma':{prisma:db},'@/lib/onedrive/security':security});
 assert.equal((await api.employeeMetadata(metadata)).entity,employee.name);
 for(const invalid of [{...metadata,employeeId:undefined},{...metadata,employeeId:'unknown'},{...metadata,employeeId:'../file'},{...metadata,kind:'TAX'}]) await assert.rejects(()=>api.employeeMetadata(invalid),ArchiveError);
 assert.equal(api.belongsToEmployee(ownDoc,employee.id),true);
 for(const document of [otherDoc,legacyDoc,nonEmployeeDoc]) assert.equal(api.belongsToEmployee(document,employee.id),false);
 assert.equal(api.sameDocumentAssignment(ownDoc,metadata),ownDoc);
 for(const document of [otherDoc,legacyDoc,nonEmployeeDoc]) assert.throws(()=>api.sameDocumentAssignment(document,metadata),error=>error.status===409);
});
function employeeRoute({authorized=true,connection=true}={}) {
 let fileReads=0;
 const api=loadTypeScript('src/app/api/personnel/documents/route.ts',{
  '@/lib/personnel/session':{requireEmployeeSession:async()=>{if(!authorized)throw new ArchiveError('Login required',401);return {employeeId:employee.id,name:employee.name};}},
  '@/lib/onedrive/security':security, '@/lib/prisma':{prisma:db},
  '@/lib/onedrive/connection':{readConnection:async()=>connection?{email:'owner@example.test',accountId:'owner-account'}:null},
  '@/lib/onedrive/documents':{ listDocuments:async accountId=>{assert.equal(accountId,'owner-account');return documents;},readDocument:async(id,accountId)=>{assert.equal(accountId,'owner-account');const document=documents.find(d=>d.id===id);if(!document)throw new ArchiveError('Missing',404);return {document};}},
  '@vercel/blob':{get:async pathname=>{assert.equal(pathname,'private-file');fileReads++;return {statusCode:200,stream:new Response('PDF fixture').body};}},
 });
 return {api,reads:()=>fileReads};
}
test('Staff list excludes other employees, unassigned legacy documents and financial documents',async () => {
 const {api,reads}=employeeRoute();const response=await api.GET(new Request('https://example.test/api/personnel/documents'));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const body=await response.json();assert.equal(body.documents.length,1);assert.equal(body.documents[0].id,ownDoc.id);
 for(const field of ['accountId','pathname','oneDrivePath','employeeId','entity']) assert.equal(field in body.documents[0],false);
 assert.equal(reads(),0);
});
test('Direct file IDs never bypass employee ownership and downloads remain private',async () => {
 const {api,reads}=employeeRoute();
 for(const document of [otherDoc,legacyDoc,nonEmployeeDoc]) assert.equal((await api.GET(new Request(`https://example.test/api/personnel/documents?id=${document.id}`))).status,404);
 assert.equal(reads(),0);
 const response=await api.GET(new Request(`https://example.test/api/personnel/documents?id=${ownDoc.id}`));
 assert.equal(response.status,200);assert.equal(await response.text(),'PDF fixture');assert.equal(reads(),1);
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 for(const config of [{authorized:false},{connection:false}]) assert.equal((await employeeRoute(config).api.GET(new Request('https://example.test/api/personnel/documents'))).status,config.authorized===false?401:503);
});
test('Staff identity does not grant management employee or user endpoints',async () => {
 let databaseReads=0;
 for(const file of ['src/app/api/employees/route.ts','src/app/api/users/route.ts']) {
  const api=loadTypeScript(file,{'@/lib/users/auth':{requirePortal:async()=>{throw new ArchiveError('Administrator session required',401);}},'@/lib/personnel/clerk':{ensureEmployeeIdentity:async()=>{}},'@/lib/onedrive/security':{...security,requireSession:async()=>{throw new ArchiveError('Owner session required',401);},assertOrigin:()=>{}},'@/lib/prisma':{prisma:{business:{findFirst:async()=>{databaseReads++;return business;}}}}});
  assert.equal((await api.GET()).status,401);
  assert.equal((await api.POST(new Request('https://example.test',{method:'POST',body:'{}'}))).status,401);
 }
 assert.equal(databaseReads,0);
});

test('Upload completion preserves employee binding, deduplicates and refuses cross-employee reuse',async () => {
 const store=new Map();let writes=0;
 const pathname='documents/files/11111111-1111-1111-1111-111111111111/bordro.pdf';
 const blobs={
  head:async()=>({size:12,contentType:'application/pdf'}),
  get:async key=>{const text=key===pathname?'PDF fixture':store.get(key);return text===undefined?null:{statusCode:200,stream:new Response(text).body,blob:{etag:'test-etag'}};},
  put:async(key,text,options)=>{if(store.has(key)&&!options.allowOverwrite)throw new Error('Already exists');writes++;store.set(key,text);},
  list:async()=>({blobs:[...store.keys()].map(pathname=>({pathname})),hasMore:false}),
 };
 const api=loadTypeScript('src/lib/onedrive/documents.ts',{'@vercel/blob':blobs,'@/lib/prisma':{prisma:{...db,employee:{findFirst:async({where})=>({...employee,id:where.id})}}},'@/lib/onedrive/security':security,'./security':security,'./connection':{},'./folder':{}});
 const saved=await api.finalizeDocument(pathname,metadata,'owner-account');
 assert.equal(saved.employeeId,employee.id);assert.equal(saved.entity,employee.name);assert.equal(writes,1);
 assert.deepEqual(await api.finalizeDocument(pathname,metadata,'owner-account'),saved);assert.equal(writes,1);
 await assert.rejects(()=>api.finalizeDocument(pathname,{...metadata,employeeId:'employee-2'},'owner-account'),error=>error.status===409);assert.equal(writes,1);
 await assert.rejects(()=>api.updatePendingDocument(saved.id,{...metadata,employeeId:'employee-2'},'owner-account'),error=>error.status===409);assert.equal(writes,1);
 // Legacy ownership requires an explicit management assignment without moving the original.
 const legacy={...saved,employeeId:undefined,oneDrivePath:'original/month/personnel.pdf',syncStatus:'SYNCED'};
 store.set(`documents/metadata/${saved.id}.json`,JSON.stringify(legacy));
 const assigned=await api.assignLegacyEmployeeDocument(saved.id,employee.id,'owner-account');
 assert.equal(assigned.employeeId,employee.id);assert.equal(assigned.oneDrivePath,legacy.oneDrivePath);assert.equal(assigned.syncStatus,'SYNCED');
 await assert.rejects(()=>api.assignLegacyEmployeeDocument(saved.id,'employee-2','owner-account'),error=>error.status===409);
});
test('Only linked active STAFF profiles can receive explicit document access; profiles default closed',async()=>{
 let records=[];const usersDb={...db,employee:{findFirst:async({where})=>where.id===employee.id&&where.businessId===business.id&&(!where.active||employee.active)?employee:null},portalUser:{...db.portalUser,create:async({data})=>{records.push(data);return data;}}};
 const api=loadTypeScript('src/app/api/users/route.ts',{'@/lib/users/auth':{requirePortal:async()=>({email:'owner@example.test'})},'@/lib/prisma':{prisma:usersDb}, '@/lib/personnel/clerk': {ensureEmployeeIdentity:async()=>{}},'@/lib/onedrive/security':{...security,assertOrigin:()=>{},requireSession:async()=>({accountId:'owner-account',email:'owner@example.test'})}});
 const submit=data=>api.POST(new Request('https://example.test/api/users',{method:'POST',body:JSON.stringify({name:user.name||'Personel A',email:user.email,role:'STAFF',employeeId:employee.id,...data})}));
 for(const data of [{role:'ADMIN',documentAccess:true},{employeeId:'',documentAccess:true},{employeeId:'unknown',documentAccess:true}]) assert.equal((await submit(data)).status,400);
 employee.active=false;
 try {assert.equal((await submit({documentAccess:true})).status,400);}finally{employee.active=true;}
 assert.equal(records.length,0);
 assert.equal((await submit({documentAccess:true})).status,200);assert.equal(records.at(-1).accessState,'ACTIVE');
 assert.equal((await submit({})).status,200);assert.equal(records.at(-1).accessState,'PLANNED');
});

test('Staff logout works on the portal, preserves owner cookies and rejects foreign origins', async () => {
 const deleted=[];
 const api=loadTypeScript('src/app/api/personnel/logout/route.ts', {
  'next/headers': {cookies:async()=>({delete:name=>deleted.push(name)})},
  '@/lib/personnel/session': {employeeCookie:'vlc_employee_session'},
  '@/lib/onedrive/security':security,
 });
 for (const origin of ['https://portal.vivalacrema.de','https://vivalacrema.vercel.app','http://localhost:3102']) {
  const response=await api.POST(new Request(`${origin}/api/personnel/logout`, {method:'POST',headers:{origin}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.deepEqual(deleted,Array(3).fill('vlc_employee_session'));
 for (const origin of ['https://attacker.example','null','']) {
  const response=await api.POST(new Request('https://portal.vivalacrema.de/api/personnel/logout', {method:'POST',headers:{origin}}));
  assert.equal(response.status,403);
 }
 assert.equal(deleted.length,3);
});
