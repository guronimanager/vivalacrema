import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { loadTypeScript } from './helpers/load-typescript.mjs';
class InputError extends Error {}
class ArchiveError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function harness() {
 const effects={permissions:[],queries:[],payments:[],suggestions:[],transactions:[]};
 const route=loadTypeScript('src/app/api/statements/reconciliation/route.ts',{
  '@/lib/users/auth':{requirePortal:async(area,write)=>{effects.permissions.push([area,!!write]);if(effects.denied)throw new ArchiveError('Denied',403);}},
  '@/lib/onedrive/security':{ArchiveError,assertOrigin:()=>{},requireSession:async()=>({accountId:'owner'})},
  '@/lib/record-input':{InputError,readInput:request=>request.json()},
  '@/lib/invoices/errors':{invoiceFailure:error=>Response.json({success:false,message:error.message},{status:error.status||400})},
  '@/lib/invoices/service':{savePayment:async(body,accountId)=>{effects.payments.push({body,accountId});return{id:'payment'};}},
  '@/lib/statements/service':{previewStatement:async(bankId,rows,owner)=>{assert.equal(owner,'owner');return rows.map(()=>({suggestions:effects.suggestions}));}},
  '@/lib/prisma':{prisma:{business:{findFirst:async()=>({id:'business'})},transaction:{findMany:async query=>{effects.queries.push(query);return effects.transactions;},findFirst:async query=>{effects.queries.push(query);return effects.bank||null;}}}},
 });
 return {route,effects};
}
const record=(id='bank-row')=>({id,date:new Date('2026-09-10T00:00:00Z'),amount:new Prisma.Decimal('119.00'),bankAccountId:'bank',bankAccount:{name:'Bank'},source:'bank_statement',description:'Supplier',invoicePayment:null});
test('Saved movements remain matchable after reload and invoices added later are refreshed',async()=>{
 const {route,effects}=harness();effects.transactions=[record()];
 const request=()=>new Request('https://example.test/api/statements/reconciliation?month=2026-09&status=PENDING');
 assert.equal((await (await route.GET(request())).json()).records[0].suggestions.length,0);
 effects.suggestions=[{id:'new-invoice',label:'Supplier INV1',paymentId:null,remaining:119,strong:true}];
 const response=await route.GET(request());const data=await response.json();
 assert.equal(data.records[0].id,'bank-row');assert.equal(data.records[0].suggestions[0].id,'new-invoice');
 assert.equal(effects.payments.length,0);
 assert.equal(effects.queries[0].where.businessId,'business');
 assert.equal(effects.queries[0].where.invoicePayment,null);
 assert.equal(effects.queries[0].where.date.lt.toISOString(),'2026-10-01T00:00:00.000Z');
});
test('Matched invoices persist in the list and pagination is bounded',async()=>{
 const {route,effects}=harness();effects.transactions=Array.from({length:101},(_,i)=>({...record(String(i)),invoicePayment:{invoice:{supplier:{name:'Supplier'},invoiceNumber:'INV1'}}}));
 const data=await(await route.GET(new Request('https://example.test/api?month=2026-09&status=MATCHED&page=2&account=bank'))).json();
 assert.equal(data.records.length,100);assert.equal(data.hasMore,true);assert.equal(data.records[0].matchedInvoice,'Supplier · INV1');
 assert.equal(effects.queries[0].skip,200);assert.equal(effects.queries[0].where.bankAccountId,'bank');
});
test('Matching uses persisted bank date/amount and delegates to duplicate-safe payment service',async()=>{
 const {route,effects}=harness();effects.bank=record();
 const response=await route.POST(new Request('https://example.test/api',{method:'POST',body:JSON.stringify({invoiceId:'invoice',transactionId:'bank-row',requestId:'uuid',paymentId:'manual-payment',amount:'0.01',date:'2099-01-01',method:'CASH'})}));
 assert.equal(response.status,200);
 const {body,accountId}=effects.payments[0];assert.equal(body.amount,'119.00');assert.equal(body.date,'2026-09-10');assert.equal(body.method,'BANK');assert.equal(body.paymentId,'manual-payment');assert.equal(accountId,'owner');
 assert.deepEqual(effects.permissions,[['bank',true],['expenses',true]]);
 assert.equal(effects.queries[0].where.businessId,'business');assert.equal(effects.queries[0].where.type,'EXPENSE');
});
test('Unauthorized, invalid periods and ineligible bank records fail before payment writes',async()=>{
 const {route,effects}=harness();effects.denied=true;
 assert.equal((await route.GET(new Request('https://example.test/api?month=2026-09'))).status,403);assert.equal(effects.queries.length,0);
 effects.denied=false;
 for(const query of ['month=2026-13','month=2026-09&page=-1','month=2026-09&status=invalid'])assert.equal((await route.GET(new Request(`https://example.test/api?${query}`))).status,400);
 assert.equal((await route.POST(new Request('https://example.test/api',{method:'POST',body:JSON.stringify({transactionId:'not-owned',invoiceId:'invoice'})}))).status,404);
 assert.equal(effects.payments.length,0);
});
