import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/load-typescript.mjs';
class ArchiveError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const security={ArchiveError,seal:()=> 'opaque-test-ticket',unseal:raw=>JSON.parse(raw)};
const own={id:'a'.repeat(64),accountId:'owner',employeeId:'employee-1',kind:'EMPLOYEE',emailRecipient:'staff@example.test',entity:'Personel A',date:'2026-10-03',originalName:'bordro.pdf',pathname:'private-file',contentType:'application/pdf',size:20,notifyEmployee:true,emailStatus:'NOT_SENT'};
function fixture({status=202,unknown=false,active=true,token=true,document={}}={}){
 let current={...own,...document};let etag=0;let sends=[];let allowed=active;
 const api=loadTypeScript('src/lib/personnel/email.ts',{
  '@/lib/prisma':{prisma:{business:{findFirst:async()=>({id:'business-1'})},portalUser:{findFirst:async({where})=>{assert.equal(where.role,'STAFF');assert.equal(where.accessState,'ACTIVE');assert.equal(where.employee.active,true);return allowed?{email:'staff@example.test'}:null;}}}},
  '@/lib/onedrive/security':security,
  '@/lib/onedrive/documents':{readDocument:async(id,accountId)=>{assert.equal(id,own.id);assert.equal(accountId,'owner');return{document:structuredClone(current),etag:String(etag)};},writeDocument:async(doc,expected)=>{if(expected!==String(etag))throw new ArchiveError('CAS conflict',409);current=structuredClone(doc);etag++;}},
  '@/lib/onedrive/connection':{mailScopes:['Mail.Send'],accessToken:async()=>{if(!token)throw new Error('Permission missing');return'test-only-token';}},
  '@vercel/blob':{get:async()=>({statusCode:200,stream:new Response('PDF fixture').body})},
 });
 return {api,get document(){return current;},get sends(){return sends;}, revoke(){allowed=false;},fetch:async(url,options)=>{assert.equal(url,'https://graph.microsoft.com/v1.0/me/sendMail');sends.push(JSON.parse(options.body));if(unknown)throw new Error('Lost reply');return {status};}};
}
async function send(f,...args){const previous=globalThis.fetch;globalThis.fetch=f.fetch;const old=process.env.ONEDRIVE_REDIRECT_URI;process.env.ONEDRIVE_REDIRECT_URI='https://example.test/api/callback';try{return await f.api.sendEmployeeDocument(...args);}finally{globalThis.fetch=previous;if(old===undefined)delete process.env.ONEDRIVE_REDIRECT_URI;else process.env.ONEDRIVE_REDIRECT_URI=old;}}
test('Personnel emails use approved address and carry original attachment plus one scoped link',async()=>{
 const f=fixture();const saved=await send(f,own.id,'owner');assert.equal(saved.emailStatus,'ACCEPTED');assert.equal(f.sends.length,1);
 const message=f.sends[0].message;assert.equal(message.toRecipients[0].emailAddress.address,own.emailRecipient);assert.equal(message.attachments[0].name,'bordro.pdf');assert.equal(Buffer.from(message.attachments[0].contentBytes,'base64').toString(),'PDF fixture');
 assert.match(message.body.content,/7 gün/);assert.match(message.body.content,/\/api\/personnel\/mail-download/);
 await send(f,own.id,'owner');assert.equal(f.sends.length,1);
});
test('Large files use scoped links; unknown or sending results never auto-send again',async()=>{
 const large=fixture({document:{size:4000000}});await send(large,own.id,'owner');assert.equal(large.sends[0].message.attachments,undefined);
 for(const options of [{unknown:true},{document:{emailStatus:'SENDING'}},{document:{emailStatus:'UNKNOWN'}}]){
  const f=fixture(options);await send(f,own.id,'owner');const count=f.sends.length;await send(f,own.id,'owner');assert.equal(f.sends.length,count);
 }
});
test('No mail is sent for revoked users, stale recipients or missing mail permission',async()=>{
 for(const options of [{active:false},{document:{emailRecipient:'wrong@example.test'}}]){
  const f=fixture(options);await assert.rejects(()=>send(f,own.id,'owner'),ArchiveError);assert.equal(f.sends.length,0);
 }
 const f=fixture({token:false});assert.equal((await send(f,own.id,'owner')).emailStatus,'FAILED');assert.equal(f.sends.length,0);
 const refused=fixture({status:403});assert.equal((await send(refused,own.id,'owner')).emailStatus,'FAILED');
});
test('Concurrent archive retries claim one send before contacting mail provider',async()=>{
 const f=fixture();const results=await Promise.allSettled([send(f,own.id,'owner'),send(f,own.id,'owner')]);assert.equal(f.sends.length,1);assert.ok(results.some(v=>v.status==='fulfilled'));
});
test('Mail links enforce expiry, employee identity, recipient approval and document kind',async()=>{
 const ticket={id:own.id,accountId:'owner',employeeId:own.employeeId,email:own.emailRecipient,expiresAt:Date.now()+60000};
 const f=fixture();assert.equal((await f.api.documentFromMailTicket(JSON.stringify(ticket))).id,own.id);
 for(const value of ['bad',JSON.stringify({...ticket,expiresAt:0}),JSON.stringify({...ticket,employeeId:'other'}),JSON.stringify({...ticket,email:'other@example.test'})])await assert.rejects(()=>f.api.documentFromMailTicket(value),ArchiveError);
 f.revoke();await assert.rejects(()=>f.api.documentFromMailTicket(JSON.stringify(ticket)),ArchiveError);
 const other=fixture({document:{kind:'TAX'}});await assert.rejects(()=>other.api.documentFromMailTicket(JSON.stringify(ticket)),ArchiveError);
});
test('Clerk identity requires verified primary email and active manager approval',async()=>{
 const key=process.env.CLERK_SECRET_KEY;process.env.CLERK_SECRET_KEY='test-only-key';
 try{
  for(const options of [{verified:false},{active:false},{primary:'other'},{signed:false},{}]){
   const api=loadTypeScript('src/lib/personnel/clerk.ts',{
    '@clerk/nextjs/server':{auth:async()=>({userId:options.signed===false?null:'clerk-user'}),currentUser:async()=>({primaryEmailAddressId:options.primary||'mail',emailAddresses:[{id:'mail',emailAddress:'staff@example.test',verification:{status:options.verified===false?'unverified':'verified'}}]})},
    '@/lib/onedrive/security':security,'@/lib/prisma':{prisma:{business:{findFirst:async()=>({id:'b'})},portalUser:{findFirst:async({where})=>{assert.equal(where.email,'staff@example.test');assert.equal(where.role,'STAFF');assert.equal(where.accessState,'ACTIVE');return options.active===false?null:{businessId:'b',employee:{id:'employee-1',name:'Personel A',businessId:'b',active:true}};}}}},
   });
   if(options.signed===false)assert.equal(await api.clerkEmployee(),null);
   else if(options.verified===false||options.active===false||options.primary)await assert.rejects(()=>api.clerkEmployee(),ArchiveError);
   else assert.deepEqual(await api.clerkEmployee(),{employeeId:'employee-1',name:'Personel A'});
  }
 }finally{if(key===undefined)delete process.env.CLERK_SECRET_KEY;else process.env.CLERK_SECRET_KEY=key;}
});
