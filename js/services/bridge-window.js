const windows = new Map();
export const bridgeOrigin = value => {
  const url = new URL(value);
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Adresse de passerelle invalide.');
  return url.origin;
};
export const prefersBridgeWindow = () => /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
export const prepareBridgeWindow = value => {
  const origin=bridgeOrigin(value);
  const existing=windows.get(origin);
  if(existing && !existing.popup.closed){existing.reload();existing.popup.focus();return;}
  let popup,ready=false;
  const pending=new Map();
  let sequence=0;
  const listener=event=>{
    if(event.origin!==origin || event.source!==popup) return;
    if(event.data?.type==='meliapp:bridge-ready'){ready=true;return;}
    if(event.data?.type!=='meliapp:bridge-response')return;
    const item=pending.get(event.data.id);
    if(!item)return;
    pending.delete(event.data.id);clearTimeout(item.timeout);
    event.data.error?item.reject(new Error(String(event.data.error))):item.resolve(event.data.data);
  };
  window.addEventListener('message',listener);
  popup=window.open(`${origin}/connect`,'meliapp-cli-connection','popup,width=520,height=420');
  if(!popup){window.removeEventListener('message',listener);throw new Error('Safari a bloqué la fenêtre. Autorise les fenêtres surgissantes pour MeliApp puis réessaie.');}
  const closedTimer=setInterval(()=>{
    if(!popup.closed)return;
    clearInterval(closedTimer);window.removeEventListener('message',listener);if(windows.get(origin)?.popup===popup) windows.delete(origin);
    for(const item of pending.values()){clearTimeout(item.timeout);item.reject(new Error('La fenêtre de connexion a été fermée. Clique sur Associer pour la rouvrir.'));}pending.clear();
  },500);
  windows.set(origin,{popup,reload:()=>{ready=false;popup.location.href=`${origin}/connect`;},request:async(action,token,body)=>{
    const deadline=Date.now()+10000;
    while(!ready){if(popup.closed)throw new Error('Fenêtre de connexion fermée.');if(Date.now()>deadline)throw new Error('La passerelle ne répond pas. Mets à jour MeliApp-local avec git pull puis relance npm run bridge avec la bonne origine.');await new Promise(resolve=>setTimeout(resolve,50));}
    return new Promise((resolve,reject)=>{
      const id=`bridge-${++sequence}`;
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Le CLI met trop de temps à répondre.'));},125000);
      pending.set(id,{resolve,reject,timeout});
      popup.postMessage({type:'meliapp:bridge-request',id,action,token,body},origin);
    });
  }});
};
export const requestThroughBridgeWindow = (origin,action,token,body) => {
  const channel=windows.get(origin);
  if(!channel || channel.popup.closed)throw new Error('Ouvre la fenêtre locale avec Associer la passerelle.');
  return channel.request(action,token,body);
};
