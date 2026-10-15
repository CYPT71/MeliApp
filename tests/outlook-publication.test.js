import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutlookService } from '../js/services/outlook.js';
test('Graph mocks verify future-only publication, stable transactions and partial-failure retry without duplicates',async t=>{
  const originalFetch=globalThis.fetch, originalStorage=globalThis.sessionStorage;
  const values=new Map([['meliapp:microsoft:accounts',JSON.stringify([{id:'mock',accessToken:'mock-token'}])],['meliapp:microsoft:active_account','mock']]);
  globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  t.after(()=>{globalThis.fetch=originalFetch;globalThis.sessionStorage=originalStorage;});
  const bodies=[];let fail=true;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://graph.microsoft.com/v1.0/me/events');
    const body=JSON.parse(options.body);bodies.push(body);
    if(bodies.length===2&&fail){fail=false;return new Response(JSON.stringify({error:{message:'Graph temporary error'}}),{status:503});}
    return new Response(JSON.stringify({id:`event-${bodies.length}`}),{status:201});
  };
  const start=Date.now()+3600000;
  const block=(type,offset)=>({type,taskId:type==='task'?'t':null,title:'Test',startIso:new Date(start+offset).toISOString(),endIso:new Date(start+offset+10*60000).toISOString()});
  const blocks=[block('task',0),block('break',10*60000),{...block('task',0),startIso:'2020-01-01T00:00:00Z',endIso:'2020-01-01T01:00:00Z'}];
  const service=createOutlookService({clientId:'mock'});
  await assert.rejects(service.createPlanningBlocks(blocks),error=>error.publishedCount===1);
  const result=await service.createPlanningBlocks(blocks);assert.equal(result.length,2);assert.equal(bodies.length,3);
  assert.equal(bodies[1].transactionId,bodies[2].transactionId);assert.match(bodies[0].body.content,/MeliAppTaskId: t/);assert.equal(bodies[0].showAs,'busy');assert.equal(bodies[2].showAs,'free');
  await service.createPlanningBlocks(blocks);assert.equal(bodies.length,3);
  const reloaded=createOutlookService({clientId:'mock'});await reloaded.createPlanningBlocks([blocks[0]]);assert.equal(bodies[3].transactionId,bodies[0].transactionId);
});
