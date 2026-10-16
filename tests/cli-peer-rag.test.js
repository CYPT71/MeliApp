import { get } from "node:http";
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBridge, cliInvocation } from '../bridge/meliapp-bridge.mjs';
import { buildRagIndex, retrieveContext } from '../js/domain/rag.js';
import { createPeerLink, shareableData, validatePeerData } from '../js/services/peer-link.js';
import { cliAiFeatures } from '../js/features-cli-ai.js';
const fixture = () => ({ features: { tasks: { items: [{ id:'future',title:'Préparer examen mathématiques',estimateMinutes:30 }, { id:'old',title:'Facture passée',deadline:'2020-01-01T00:00:00Z' }, { id:'done',title:'Terminé',status:'completed' }] }, projects:{items:[]}, energy:{value:2,updatedAt:'2026-10-19T08:00:00Z'}, cliAi:{} }, calendar:{events:[]}, auth:{ accessToken:'PRIVATE' } });
test('RAG retrieves relevant future documents, excluding finished work and credentials', () => {
  const state=fixture(), index=buildRagIndex(state);
  assert.equal(index.documents.length,1);
  const result=retrieveContext(index,'examen de mathématiques',state);
  assert.equal(result.sources[0].title,'Préparer examen mathématiques');
  assert.equal(result.energy.value,2); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('bridge authenticates origins and code, validates provider and passes prompt as data', async t => {
  const calls=[];
  const {server,token}=createBridge({origin:'https://meliapp.example', execute:async (...args) => {calls.push(args);return 'Conseil';}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const headers={Origin:'https://meliapp.example',Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(url+'/health',{headers:{...headers,Origin:'https://other.example'}})).status,403);
  assert.equal((await fetch(url+'/health',{headers:{...headers,Authorization:'bad'}})).status,401);
  assert.equal((await fetch(url+'/health',{headers})).status,200);
  assert.equal((await fetch(url+'/prompt',{method:'POST',headers,body:JSON.stringify({provider:'shell',prompt:'test'})})).status,400);
  const prompt='test $(echo nope) `echo nope`; & whoami';
  const response=await fetch(url+'/prompt',{method:'POST',headers,body:JSON.stringify({provider:'codex',prompt})});
  assert.deepEqual(await response.json(),{text:'Conseil'}); assert.equal(calls[0][1],prompt);
  assert.throws(()=>cliInvocation('anything'));
  assert.ok(cliInvocation('codex')[1].includes('read-only')); assert.ok(cliInvocation('claude')[1].includes('--tools'));
});
class Channel extends EventEmitter {
  open=false;
  send(value){ queueMicrotask(()=>this.other.emit('data',structuredClone(value))); }
  close(){ if (!this.open)return; this.open=false;this.other.open=false;this.emit('close');this.other.emit('close'); }
}
const peers=new Map();
class MockPeer extends EventEmitter {
  constructor(id){super();this.id=id;peers.set(id,this);queueMicrotask(()=>this.emit('open',id));}
  connect(id){const a=new Channel(),b=new Channel();a.other=b;b.other=a;queueMicrotask(()=>{peers.get(id).emit('connection',b);a.open=b.open=true;b.emit('open');a.emit('open');});return a;}
  destroy(){peers.delete(this.id);}
}
const waitFor = async predicate => { for(let i=0;i<40;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));} assert.ok(predicate()); };
test('QR pairing transfers only user data, forwards AI directly and preserves received data after PC disconnect', async t=>{
  const load=async()=>({Peer:MockPeer,QRCode:{toDataURL:async url=>'data:image/png;base64,MOCK'}});
  const host=createPeerLink({load}),phone=createPeerLink({load});t.after(()=>{host.disconnect();phone.disconnect();});
  let received,call;
  host.configure({getData:()=>shareableData(fixture()),aiAvailable:()=>true,prompt:async(provider,prompt)=>{call={provider,prompt};return 'Conseil du PC';}});
  phone.configure({getData:()=>shareableData(fixture()),onData:async data=>{received=data;}});
  const invite=await host.host('https://meliapp.example/app/');
  const data=JSON.parse(decodeURIComponent(new URL(invite.url).hash.slice(6)));
  await phone.join(data);await waitFor(()=>phone.isConnected()&&received);
  assert.ok(validatePeerData(received));assert.ok(!JSON.stringify(received).includes('PRIVATE'));
  assert.equal(await phone.prompt('codex','Organise ma semaine'),'Conseil du PC');assert.deepEqual(call,{provider:'codex',prompt:'Organise ma semaine'});
  host.disconnect();await waitFor(()=>!phone.isConnected());
  assert.equal(received.tasks[0].id,'future');
  await assert.rejects(phone.prompt('codex','Test'),/PC indisponible/);
  await assert.rejects(phone.join({...data,expiresAt:0}),/expiré/);
});
test('AI rejects unknown task IDs and never modifies tasks on invalid output',async()=>{
  const state=fixture(),before=structuredClone(state);
  let index;
  const services={storage:{saveRagIndex:async value=>{index=value;},loadRagIndex:async()=>index},peerLink:{isRemote:()=>false},cliAi:{prompt:async()=>'{"taskIds":["invented"],"reason":"oops"}'}};
  const result=await cliAiFeatures.cliAi.run({state,event:'cli-ai:optimize',payload:{provider:'codex'},services});
  assert.match(result.features.cliAi.error,/invalide/);assert.deepEqual(result.features.tasks,before.features.tasks);assert.equal(result.features.cliAi.optimization,undefined);
});
test('P2P import preserves newer local edits and energy while persisting newly received items',async()=>{
  const state=fixture();state.features.tasks.items[0].updatedAt='2026-10-20T00:00:00Z';
  const payload={tasks:[{id:'future',title:'Old remote title',updatedAt:'2026-10-19T00:00:00Z'},{id:'new',title:'Nouvelle tâche'}],projects:[],events:[],energy:{value:9,updatedAt:'2026-10-18T00:00:00Z'}};
  const result=await cliAiFeatures.cliAi.run({state,event:'cli-ai:peer-data',payload,services:{}});
  assert.equal(result.features.tasks.items[0].title,state.features.tasks.items[0].title);assert.ok(result.features.tasks.items.some(t=>t.id==='new'));assert.equal(result.features.energy.value,2);
});
test('AI session recommendations are accepted inside user limits and rejected outside them',async()=>{
  const state=fixture();state.features.sessionPreferences={workMinutes:30,breakMinutes:15,allowAi:true};
  let index,response={taskIds:['future'],reason:'Énergie basse : une étape courte.',session:{workMinutes:20,breakMinutes:18}};
  const services={storage:{saveRagIndex:async value=>{index=value;},loadRagIndex:async()=>index},peerLink:{isRemote:()=>false},cliAi:{prompt:async()=>JSON.stringify(response)}};
  const run=()=>cliAiFeatures.cliAi.run({state,event:'cli-ai:optimize',payload:{provider:'claude'},services});
  const valid=await run();assert.deepEqual(valid.features.cliAi.optimization.session,{workMinutes:20,breakMinutes:18});
  response.session.workMinutes=90;
  const invalid=await run();assert.match(invalid.features.cliAi.error,/hors de tes limites/);assert.equal(invalid.features.cliAi.optimization,undefined);
});
test('Safari bridge serves a no-cache local connection page while keeping authenticated API and host checks',async t=>{
  const {server,token}=createBridge({origin:'https://meliapp.example'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(endpoint+'/connect');assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'),'no-store');
  const html=await page.text();assert.match(html,/event.source!==parent/);assert.match(html,/event.origin!==allowedOrigin/);assert.ok(!html.includes(token));
  assert.equal((await fetch(endpoint+'/health')).status,401);
  assert.equal((await fetch(endpoint+'/health',{headers:{Origin:endpoint,Authorization:`Bearer ${token}`}})).status,200);
  assert.equal((await fetch(endpoint+'/connect',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>get(endpoint+'/connect',{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject)),403);
});
test('QR creation does not wait for signaling and data-only pairing does not claim an active AI',async t=>{
  const load=async()=>({Peer:MockPeer,QRCode:{toDataURL:async()=>'data:image/png;base64,MOCK'}});
  const host=createPeerLink({load}),phone=createPeerLink({load});t.after(()=>{host.disconnect();phone.disconnect();});
  let received,aiAvailable=false;
  host.configure({getData:()=>shareableData(fixture()),aiAvailable:()=>aiAvailable,prompt:async()=>'ok'});
  phone.configure({getData:()=>shareableData(fixture()),onData:async data=>{received=data;}});
  const invite=await host.host('https://meliapp.example/');assert.ok(invite.qr);
  await waitFor(()=>peers.size>=1);
  const data=JSON.parse(decodeURIComponent(new URL(invite.url).hash.slice(6)));await phone.join(data);
  await waitFor(()=>phone.isConnected()&&received);
  assert.equal(phone.isRemote(),false);await assert.rejects(phone.prompt('codex','test'),/Aucune IA/);
  aiAvailable=true;host.refreshCapabilities();await waitFor(()=>phone.isRemote());
  assert.equal(await phone.prompt('codex','test'),'ok');
});
test('a QR remains available even if the signaling service rejects connection',async t=>{
  class UnavailablePeer extends EventEmitter{constructor(id){super();queueMicrotask(()=>this.emit('error',new Error('Service inaccessible')));}destroy(){this.emit('close');}}
  const status=[];
  const service=createPeerLink({load:async()=>({Peer:UnavailablePeer,QRCode:{toDataURL:async()=>'data:image/png;base64,OFFLINE'}})});
  service.configure({onStatus:value=>status.push(value.status)});t.after(()=>service.disconnect());
  const invite=await service.host('https://meliapp.example/');assert.ok(invite.qr);
  await waitFor(()=>status.some(value=>value.includes('QR affiché, mais connexion indisponible')));
});
import { peerInviteFromUrl } from '../js/services/peer-link.js';
test('scanner accepts only current MeliApp invites and rejects foreign sites, invalid and expired tokens',()=>{
  const now=Date.now(),invite={id:'meliapp-'+'a'.repeat(48),secret:'b'.repeat(48),expiresAt:now+60000};
  const make=(origin='https://meliapp.example/app/',data=invite)=>origin+'#pair='+encodeURIComponent(JSON.stringify(data));
  assert.deepEqual(peerInviteFromUrl(make(),'https://meliapp.example/app/',now),invite);
  assert.throws(()=>peerInviteFromUrl(make('https://attacker.example/'),'https://meliapp.example/app/',now),/cette app/);
  assert.throws(()=>peerInviteFromUrl(make('https://meliapp.example/another/'),'https://meliapp.example/app/',now),/cette app/);
  assert.throws(()=>peerInviteFromUrl(make(undefined,{...invite,expiresAt:now-1}),'https://meliapp.example/app/',now),/expiré/);
  assert.throws(()=>peerInviteFromUrl(make(undefined,{...invite,secret:'bad'}),'https://meliapp.example/app/',now),/invalide/);
});
