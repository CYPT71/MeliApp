import { connectPage } from "../bridge/connect-page.mjs";
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
const seed = async page => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.evaluate(async () => {
    const { features } = await import('/js/core/registry.js');
    const { createInitialState } = await import('/js/core/state.js');
    const { createIndexedDbStorage } = await import('/js/services/storage.js');
    const state = createInitialState(features);
    state.features.projects.items = [{ id: 'p', title: 'Projet long' }];
    state.features.tasks.items = Array.from({ length: 35 }, (_, i) => ({ id: `t${i}`, title: `Étape ${i}`, projectId: 'p', status: 'active', estimateMinutes: 90, difficulty: 3, importance: 3, splittable: true }));
    state.features.energy = { value: 2.2, updatedAt: '2020-01-01T00:00:00Z', expiresAfterMinutes: 180 };
    await createIndexedDbStorage().save(state);
  });
  await page.goto('/#/mindmap'); await page.reload();
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
};
const stored = page => page.evaluate(async () => (await (await import('/js/services/storage.js')).createIndexedDbStorage().load()));

test('long mindmap scrolls under pointer and reaches final task', async ({ page, isMobile }) => {
  await seed(page);
  const tree = page.locator('.mindmap-view');
  await tree.scrollIntoViewIfNeeded();
  const box = await tree.boundingBox();
  await page.mouse.move(Math.min(200,box.x+50), 400);
  const before = await page.evaluate(() => scrollY);
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 650 }] });
    for (let y=600;y>=150;y-=50) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:150, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.wheel(0,700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Modifier Étape 34', exact:true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Modifier Étape 34', exact:true })).toBeInViewport();
});

test('task popup remains centered after page scroll and viewport changes', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Modifier Étape 34', exact:true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  const centered = async () => page.evaluate(() => {
    const r = document.querySelector('dialog:modal').getBoundingClientRect(), v=visualViewport;
    return { dx: Math.abs(r.x+r.width/2-(v.offsetLeft+v.width/2)), dy: Math.abs(r.y+r.height/2-(v.offsetTop+v.height/2)), fits: r.height<=v.height };
  });
  await expect.poll(async () => (await centered()).dy).toBeLessThan(3);
  await page.setViewportSize({ width:390, height:400 });
  await expect.poll(async () => (await centered()).dy).toBeLessThan(3);
  expect((await centered()).dx).toBeLessThan(3); expect((await centered()).fits).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

test('saved energy persists beyond expiry and recalculates work sessions after a change', async ({ page }) => {
  await seed(page);
  await page.goto('/#/now');
  const low = (await stored(page)).features.adaptiveSchedule.weekly;
  await page.goto('/#/energy');
  // Energy lives on the home route in some navigation layouts: find its rendered control there.
  if (!await page.getByRole('radio', { name: /Cerveau en feu/ }).count()) await page.goto('/#/');
  await page.getByRole('radio', { name: /Cerveau en feu/ }).click();
  await expect.poll(async () => (await stored(page)).features.energy.value).toBe(9.6);
  const high = (await stored(page)).features.adaptiveSchedule.weekly;
  expect(high.policy.workMinutes).toBeGreaterThan(low.policy.workMinutes);
  await page.reload();
  await expect.poll(async () => (await stored(page)).features.energy.value).toBe(9.6);
  await expect(page.getByText('Énergie enregistrée automatiquement pour adapter ton agenda.')).toBeVisible();
});

test('CLI pairing, IndexedDB RAG and validated AI optimization use the real UI', async ({ page }) => {
  let prompt = '';
  await page.context().route('http://127.0.0.1:8766/**', async route => {
    const request = route.request();
    if(request.url().endsWith('/connect'))return route.fulfill({body:connectPage('http://127.0.0.1:8081','test-nonce'),contentType:'text/html'});
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:8081', 'access-control-allow-headers':'Authorization, Content-Type', 'access-control-allow-methods':'GET, POST, OPTIONS' };
    if (request.method()==='OPTIONS') return route.fulfill({ status:204,headers });
    if (request.url().endsWith('/health')) return route.fulfill({ json:{ app:'meliapp-cli',version:1 },headers });
    prompt = request.postDataJSON().prompt;
    return route.fulfill({ json:{ text: JSON.stringify({ taskIds:['t0'], session:{workMinutes:15,breakMinutes:18}, reason:'Commencer par une petite étape adaptée à ton énergie.' }) },headers });
  });
  await seed(page); await page.goto('/#/settings');
  await page.getByLabel('Code d’association du terminal', {exact:true}).fill('test-token');
  await page.getByRole('button', { name:'Associer la passerelle',exact:true }).click();
  await expect(page.getByText('Passerelle associée pour cette session.')).toBeVisible();
  await page.getByRole('button', { name:'Optimiser mon agenda avec l’IA',exact:true }).click();
  await expect(page.getByText('Commencer par une petite étape adaptée à ton énergie.', { exact:true })).toBeVisible();
  expect(prompt).toContain('CONTEXTE RETROUVÉ'); expect(prompt).toContain('2.2');
  const data = await stored(page); expect(data.features.cliAi.optimization.taskIds).toEqual(['t0']);
  expect(data.features.cliAi.optimization.session).toEqual({workMinutes:15,breakMinutes:18});
  await expect.poll(async () => (await stored(page)).features.adaptiveSchedule.weekly.policy.workMinutes).toBe(15);
  const index = await page.evaluate(async () => (await import('/js/services/storage.js')).createIndexedDbStorage().loadRagIndex());
  expect(index.documents).toHaveLength(35);
  expect(JSON.stringify(data)).not.toContain('test-token');
});

test('user session durations persist and bound both weekly proposals and focus sessions', async ({ page }) => {
  await seed(page); await page.goto('/#/day');
  await page.getByRole('spinbutton', { name:'Durée maximale de travail (minutes)' }).fill('20');
  await page.getByRole('spinbutton', { name:'Pause minimale (minutes)' }).fill('15');
  await page.getByRole('button', { name:'Enregistrer mes durées',exact:true }).click();
  await expect.poll(async () => (await stored(page)).features.sessionPreferences.workMinutes).toBe(20);
  const plan=(await stored(page)).features.adaptiveSchedule.weekly;
  expect(plan.policy.workMinutes).toBeLessThanOrEqual(20);expect(plan.policy.breakMinutes).toBeGreaterThanOrEqual(15);
  await page.reload();await expect(page.getByRole('spinbutton', { name:'Durée maximale de travail (minutes)' })).toHaveValue('20');
});

test('QR association with mocked P2P transport preserves phone data offline after PC closes', async ({ browser, page }) => {
  const sockets=new Map(), transport=[];
  const vendor=await readFile('js/vendor/peer-qr.js','utf8');
  const mockModule=`
import { QRCode } from '/js/vendor/peer-qr-original.js';
export { QRCode };
class Emitter { listeners={};on(type,callback){(this.listeners[type]??=[]).push(callback);return this;}emit(type,value){for(const cb of this.listeners[type]??[])cb(value);} }
class Channel extends Emitter { open=false;constructor(peer,target){super();this.peer=peer;this.target=target;}send(data){this.peer.socket.send(JSON.stringify({type:'DATA',dst:this.target,data}));}close(){if(!this.open)return;this.open=false;this.peer.socket.send(JSON.stringify({type:'CLOSE',dst:this.target}));this.emit('close');} }
export class Peer extends Emitter {
 constructor(id){super();this.id=id;this.channels=new Map();this.socket=new WebSocket('wss://meliapp-p2p-test.example/'+id);this.socket.onmessage=event=>{
 const message=JSON.parse(event.data);
 if(message.type==='OPEN')this.emit('open',id);
 else if(message.type==='CONNECT'){const channel=new Channel(this,message.src);this.channels.set(message.src,channel);this.emit('connection',channel);channel.open=true;channel.emit('open');this.socket.send(JSON.stringify({type:'ACCEPT',dst:message.src}));}
 else if(message.type==='ACCEPT'){const channel=this.channels.get(message.src);channel.open=true;channel.emit('open');}
 else if(message.type==='DATA')this.channels.get(message.src).emit('data',message.data);
 else if(message.type==='CLOSE'){const channel=this.channels.get(message.src);channel.open=false;channel.emit('close');}
 }; }
 connect(id){const channel=new Channel(this,id);this.channels.set(id,channel);this.socket.send(JSON.stringify({type:'CONNECT',dst:id}));return channel;}
 destroy(){for(const channel of this.channels.values())channel.close();this.socket.close();}
}
`;
  const mockTransport=async context=>{
    await context.route('**/js/vendor/peer-qr-original.js',route=>route.fulfill({body:vendor,contentType:'text/javascript'}));
    await context.route('**/js/vendor/peer-qr.js',route=>route.fulfill({body:mockModule,contentType:'text/javascript'}));
    await context.routeWebSocket('wss://meliapp-p2p-test.example/**',socket=>{
      const id=new URL(socket.url()).pathname.slice(1);sockets.set(id,socket);
      socket.onMessage(raw=>{const message=JSON.parse(String(raw));transport.push(message.type);sockets.get(message.dst)?.send(JSON.stringify({...message,src:id}));});
      socket.onClose(()=>{sockets.delete(id);for(const other of sockets.values())other.send(JSON.stringify({type:'CLOSE',src:id}));});
      socket.send(JSON.stringify({type:'OPEN'}));
    });
  };
  await mockTransport(page.context());
  await page.context().route('http://127.0.0.1:8766/**',route=>{
    if(route.request().url().endsWith('/connect'))return route.fulfill({body:connectPage('http://127.0.0.1:8081','test-nonce'),contentType:'text/html'});
    const headers={'access-control-allow-origin':'http://127.0.0.1:8081','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET, POST, OPTIONS'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    return route.fulfill({json:route.request().url().endsWith('/health')?{app:'meliapp-cli'}:{text:'Conseil transmis par le PC en P2P.'},headers});
  });
  await seed(page);await page.goto('/#/settings');
  await page.getByLabel('Code d’association du terminal',{exact:true}).fill('pc-token');
  await page.getByRole('button',{name:'Associer la passerelle',exact:true}).click();
  await expect(page.getByText('Passerelle associée pour cette session.')).toBeVisible();
  await page.getByRole('button',{name:'Relier mon natel en P2P · QR code',exact:true}).click();
  const link=page.getByRole('link',{name:'Lien d’association (valable 10 minutes)'});
  await expect(link).toBeVisible();
  await expect(page.getByRole('img',{name:'QR code d’association P2P au téléphone'})).toBeVisible();
  const url=await link.getAttribute('href');
  const phoneContext=await browser.newContext({serviceWorkers:'allow',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mockTransport(phoneContext);
  const phone=await phoneContext.newPage();
  try {
    await phone.goto(url);
    await expect(phone.getByText('IA reliée au PC par P2P.')).toBeVisible({timeout:10000});
    await expect.poll(async()=>(await stored(phone))?.features.tasks.items.length).toBe(35);
    await phone.getByRole('button',{name:'Demander avec mon contexte',exact:true}).click();
    await expect(phone.getByText('Conseil transmis par le PC en P2P.',{exact:true})).toBeVisible();
    expect(transport).toContain('CONNECT');expect(transport).toContain('DATA');
    await phone.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.close();
    await expect(phone.getByText(/Appareil hors ligne/)).toBeVisible({timeout:15000});
    await phone.reload();
    await phoneContext.setOffline(true);
    await phone.goto('/#/mindmap');
    await expect(phone.getByRole('button',{name:'Modifier Étape 34',exact:true})).toBeAttached();
    expect((await stored(phone)).features.tasks.items).toHaveLength(35);
    expect((await stored(phone)).features.energy.value).toBe(2.2);
  } finally {await phoneContext.close();}
});

test('Outlook popup is centered and saves nature and placement before recalculating', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-19T08:00:00Z')});
  await seed(page);
  await page.evaluate(async()=>{
    const storage=(await import('/js/services/storage.js')).createIndexedDbStorage();const state=await storage.load();
    state.calendar.events=[{id:'e',calendarId:'c',title:'Révision future',start:new Date(Date.now()+3*3600000).toISOString(),end:new Date(Date.now()+4*3600000).toISOString()}];
    state.features.itemInspector={open:true,type:'event',key:'c:e'};await storage.save(state);
  });
  await page.reload();const dialog=page.getByRole('dialog',{name:'Préciser l’élément Outlook'});await expect(dialog).toBeVisible();
  const delta=await dialog.evaluate(element=>{const rect=element.getBoundingClientRect();return Math.abs(rect.y+rect.height/2-(visualViewport.offsetTop+visualViewport.height/2));});expect(delta).toBeLessThan(3);
  await dialog.getByRole('combobox',{name:'Nature',exact:true}).selectOption('appointments');
  await dialog.getByRole('combobox',{name:'Placement',exact:true}).selectOption('fixed');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect.poll(async()=>(await stored(page)).features.calendarSources.itemPlacements['c:e']).toBe('fixed');
  expect((await stored(page)).features.calendarSources.roles['c:e']).toBe('appointments');
  await expect.poll(async()=>(await stored(page)).features.adaptiveSchedule.blocks.some(block=>block.title==='Révision future'&&block.type==='event')).toBe(true);
});
