import { test, expect } from '@playwright/test';
import { createBridge } from '../bridge/meliapp-bridge.mjs';

for (const automatic of [false,true]) test(`${automatic ? 'Safari detection' : 'Explicit local window'} connects and prompts when direct access is blocked`,async({page})=>{
  if(automatic)await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'}));
  const prompts=[];
  const {server,token}=createBridge({origin:'http://127.0.0.1:8081',execute:async(provider,prompt)=>{prompts.push({provider,prompt});return 'Connexion locale compatible Safari.';}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  let popup;
  try {
    await page.route(`${endpoint}/**`,route=>route.abort('blockedbyclient'));
    await page.goto('/#/settings');
    await expect(page.locator('#storage-status')).toContainText('sauvegardées');
    await page.getByLabel('Adresse de la passerelle',{exact:true}).fill(endpoint);
    await page.getByLabel('Code d’association du terminal',{exact:true}).fill(token);
    const opened=page.waitForEvent('popup');
    await page.getByRole('button',{name:automatic?'Associer la passerelle':'Connexion par fenêtre locale (Safari)',exact:true}).click();
    popup=await opened;
    await expect(page.getByText('Passerelle associée pour cette session.',{exact:true})).toBeVisible();
    await expect(popup.getByRole('status')).toContainText('Connexion active');
    await page.getByRole('button',{name:'Demander avec mon contexte',exact:true}).click();
    await expect(page.getByText('Connexion locale compatible Safari.',{exact:true})).toBeVisible();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].prompt).toContain('CONTEXTE RETROUVÉ');
    const saved=await page.evaluate(async()=>(await(await import('/js/services/storage.js')).createIndexedDbStorage().load()));
    expect(JSON.stringify(saved)).not.toContain(token);
    await popup.close();
    await page.getByRole('button',{name:'Demander avec mon contexte',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'Ouvre la fenêtre locale'})).toBeVisible();
  } finally {if(popup&&!popup.isClosed())await popup.close();await new Promise(resolve=>server.close(resolve));}
});

test('local bridge page rejects messages from a window other than its opener',async({page})=>{
  const {server}=createBridge({origin:'http://127.0.0.1:8081'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/connect`);
    await expect(page.getByRole('status')).toContainText('Ouvre cette fenêtre avec le bouton');
    await page.evaluate(()=>window.postMessage({type:'meliapp:bridge-request',id:'forged',action:'health',token:'bad'},location.origin));
    await expect(page.getByRole('status')).toContainText('Ouvre cette fenêtre avec le bouton');
  } finally {await new Promise(resolve=>server.close(resolve));}
});
