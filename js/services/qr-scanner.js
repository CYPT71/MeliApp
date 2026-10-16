import { peerInviteFromUrl } from './peer-link.js';
let active=null;
export const scanPairingQr = async () => {
  if(active){active.focus();throw new Error('Le scanner est déjà ouvert.');}
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Caméra indisponible. Ouvre MeliApp en HTTPS dans Safari et autorise la caméra.');
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='qr-scanner';dialog.setAttribute('aria-label','Scanner un QR code MeliApp');
  const title=document.createElement('h2');title.textContent='Scanner le QR du Mac';
  const hint=document.createElement('p');hint.textContent='Place le QR affiché dans Appareils sur le Mac devant la caméra. Les images restent sur ce natel.';
  const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Autorise la caméra pour commencer.';
  const close=document.createElement('button');close.type='button';close.textContent='Fermer le scanner';
  dialog.append(title,hint,video,status,close);document.body.append(dialog);active=dialog;
  let stream,frame,closed=false,last=0,decoding=false;
  return new Promise((resolve,reject)=>{
    const finish=(error,value)=>{
      if(closed)return;closed=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;
      document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pageHidden);
      if(dialog.open&&dialog.close)dialog.close();dialog.remove();active=null;previous?.focus?.({preventScroll:true});
      error?reject(error):resolve(value??null);
    };
    const hidden=()=>{if(document.hidden)finish(null);};
    const pageHidden=()=>finish(null);
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pageHidden);
    close.onclick=()=>finish(null);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();finish(null);}
      if(event.key==='Tab'){event.preventDefault();close.focus();}
    });
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');close.focus();
    (async()=>{
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
        if(closed){stream.getTracks().forEach(track=>track.stop());return;}
        video.srcObject=stream;await video.play();
        const {jsQR}=await import('../vendor/peer-qr.js');
        const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw new Error('Le navigateur ne peut pas lire les images de la caméra.');
        status.textContent='Recherche du QR MeliApp…';
        const tick=time=>{
          if(closed)return;
          frame=requestAnimationFrame(tick);
          if(decoding||time-last<200||video.readyState<2||!video.videoWidth)return;
          last=time;decoding=true;
          try{
            const scale=Math.min(1,640/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
            context.drawImage(video,0,0,canvas.width,canvas.height);
            const image=context.getImageData(0,0,canvas.width,canvas.height);
            const result=jsQR(image.data,image.width,image.height,{inversionAttempts:'attemptBoth'});
            if(result?.data){
              try{const invite=peerInviteFromUrl(result.data,location.href);finish(null,invite);}
              catch(error){status.textContent=error.message;}
            }
          } catch(error){finish(error);}finally{decoding=false;}
        };
        frame=requestAnimationFrame(tick);
      } catch(error){
        const message=error.name==='NotAllowedError'?'Accès à la caméra refusé. Autorise la caméra dans les réglages Safari pour ce site puis réessaie.':error.name==='NotFoundError'?'Aucune caméra disponible sur cet appareil.':error.message;
        finish(new Error(message));
      }
    })();
  });
};
