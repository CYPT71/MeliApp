// The local top-level page avoids cross-origin HTTPS -> HTTP fetch restrictions.
export const connectPage = (origin, nonce) => `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>MeliApp · connexion IA locale</title>
<h1>Connexion IA à MeliApp</h1>
<p id="status" role="status">Garde cette fenêtre ouverte et retourne dans MeliApp pour terminer l’association.</p>
<p>Les demandes Claude/Codex passent par cette fenêtre. Aucune donnée n’est enregistrée ici.</p>
<script nonce="${nonce}">
const allowedOrigin=${JSON.stringify(origin).replaceAll('<','\\u003c')};
const parent=window.opener;
const status=document.getElementById('status');
let busy=false;
if (!parent) status.textContent='Ouvre cette fenêtre avec le bouton de connexion dans MeliApp.';
window.addEventListener('message',async event=>{
  if (event.source!==parent || event.origin!==allowedOrigin) return;
  const message=event.data;
  if (!message || message.type!=='meliapp:bridge-request' || typeof message.id!=='string' || !['health','prompt'].includes(message.action) || typeof message.token!=='string') return;
  const reply=value=>parent.postMessage({type:'meliapp:bridge-response',id:message.id,...value},allowedOrigin);
  if (busy) {reply({error:'Une demande est déjà en cours.'});return;}
  busy=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),125000);
  try {
    const response=await fetch('/'+message.action,{method:message.action==='prompt'?'POST':'GET',headers:{Authorization:'Bearer '+message.token,...(message.action==='prompt'?{'Content-Type':'application/json'}:{})},...(message.action==='prompt'?{body:JSON.stringify(message.body)}:{}),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || (response.status===401?'Code d’association incorrect.':'Passerelle : erreur '+response.status));
    status.textContent='Connexion active. Garde cette fenêtre ouverte ; tu peux revenir dans MeliApp.';
    reply({data});
  } catch(error){status.textContent='Connexion interrompue : '+error.message;reply({error:error.name==='AbortError'?'Le CLI met trop de temps à répondre.':error.message});}
  finally {clearTimeout(timeout);busy=false;}
});
if(parent) parent.postMessage({type:'meliapp:bridge-ready'},allowedOrigin);
</script></html>`;
