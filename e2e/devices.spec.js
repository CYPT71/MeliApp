import { test,expect } from '@playwright/test';

test('Devices shows a QR without CLI setup, even while signaling is unavailable',async({page,context})=>{
  await context.routeWebSocket(/wss:\/\/0\.peerjs\.com(?::443)?\//,socket=>socket.close({code:1008,reason:'Signaling unavailable in test'}));
  await page.goto('/');
  await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.getByRole('link',{name:'📱 Appareils',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Relier mes appareils · sans installation',exact:true})).toBeVisible();
  await expect(page.getByLabel('Code d’association du terminal')).toHaveCount(0);
  await page.getByRole('button',{name:'Afficher le QR code',exact:true}).click();
  const image=page.getByRole('img',{name:'QR code d’association P2P au téléphone'});
  await expect(image).toBeVisible({timeout:5000});
  await expect(page.getByRole('button',{name:'Regénérer le QR code',exact:true})).toBeVisible();
  const link=await page.getByRole('link',{name:'Lien d’association (valable 10 minutes)'}).getAttribute('href');
  expect(new URL(link).origin).toBe('http://127.0.0.1:8081');
  expect(new URL(link).hash).toContain('pair=');
  const saved=await page.evaluate(async()=>(await(await import('/js/services/storage.js')).createIndexedDbStorage().load()));
  expect(saved.features.cliAi.connected).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('camera scanner decodes a real QR locally and stops the camera after reading',async({page,context})=>{
  await context.routeWebSocket(/wss:\/\/0\.peerjs\.com(?::443)?\//,socket=>socket.close({code:1008,reason:'Signaling unavailable in test'}));
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async constraints=>{
      window.__cameraConstraints=constraints;
      const {QRCode}=await import('/js/vendor/peer-qr.js');
      const invite={id:'meliapp-'+'a'.repeat(48),secret:'b'.repeat(48),expiresAt:Date.now()+60000};
      const url=location.origin+location.pathname+'#pair='+encodeURIComponent(JSON.stringify(invite));
      const image=new Image();image.src=await QRCode.toDataURL(url,{width:512,margin:4});await image.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,512,512);
      const stream=canvas.captureStream(15),track=stream.getVideoTracks()[0];window.__cameraTrack=track;
      const start=performance.now();const interval=setInterval(()=>{if(performance.now()-start>500)ctx.drawImage(image,0,0);else ctx.fillRect(0,0,512,512);},70);
      track.addEventListener('ended',()=>clearInterval(interval));return stream;
    };
  });
  await page.goto('/#/devices');await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.getByRole('button',{name:'Scanner un QR code',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Scanner un QR code MeliApp',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0,{timeout:10000});
  expect(await page.evaluate(()=>window.__cameraConstraints.video.facingMode.ideal)).toBe('environment');
  await expect.poll(()=>page.evaluate(()=>window.__cameraTrack?.readyState)).toBe('ended');
});

test('camera refusal shows a useful message and closes the scanner',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await page.goto('/#/devices');await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.getByRole('button',{name:'Scanner un QR code',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Accès à la caméra refusé');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for(const background of [false,true]) test(`${background?'Leaving the page':'Closing scanner'} before permission resolves stops a late camera stream`,async({page})=>{
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      await new Promise(resolve=>setTimeout(resolve,500));const canvas=document.createElement('canvas');
      const stream=canvas.captureStream();window.__cameraTrack=stream.getVideoTracks()[0];return stream;
    };
  });
  await page.goto('/#/devices');await expect(page.locator('#storage-status')).toContainText('sauvegardées');
  await page.getByRole('button',{name:'Scanner un QR code',exact:true}).click();
  if(background)await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  else await page.getByRole('button',{name:'Fermer le scanner',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.__cameraTrack?.readyState)).toBe('ended');
});
