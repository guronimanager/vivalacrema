import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/load-typescript.mjs';
const { runDocumentBatch } = loadTypeScript('src/lib/document-batch.ts');
test('A failed file does not block later files and duplicate checks remain sequential', async () => {
 const calls=[],results=[],known=new Map();let active=0;
 await runDocumentBatch([{name:'one.pdf',content:'same'},{name:'broken.pdf',content:null},{name:'renamed.pdf',content:'same'},{name:'new.pdf',content:'other'}], async file => {
  assert.equal(active++,0);calls.push(file.name);
  try {
   await Promise.resolve();
   if(file.content===null)throw new Error('Dosya okunamadı');
   const duplicate=known.has(file.content); const id=known.get(file.content)||file.content;known.set(file.content,id);
   return {id,duplicate};
  } finally {active--;}
 },(index,result)=>results.push({index,...result}));
 assert.deepEqual(calls,['one.pdf','broken.pdf','renamed.pdf','new.pdf']);
 assert.equal(results[0].value.duplicate,false);
 assert.equal(results[1].success,false);assert.equal(results[1].message,'Dosya okunamadı');
 assert.equal(results[2].value.duplicate,true);assert.equal(results[2].value.id,results[0].value.id);
 assert.equal(results[3].success,true);assert.equal(known.size,2);
});
test('Empty batch has no effects and unknown errors yield a useful message',async()=>{
 let calls=0;await runDocumentBatch([],async()=>{calls++;},()=>{calls++;});assert.equal(calls,0);
 const results=[];await runDocumentBatch([1],async()=>{throw null;},(_,result)=>results.push(result));
 assert.deepEqual(results,[{success:false,message:'İşlem tamamlanamadı.'}]);
});
