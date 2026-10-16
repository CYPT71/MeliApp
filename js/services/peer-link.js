export const peerInviteFromUrl = (value, base, now = Date.now()) => {
  let url, app, invite;
  try {
    url=new URL(value);app=new URL(base);
    const path=value=>value.replace(/index\.html$/,'').replace(/\/+$/,'');
    if(url.origin!==app.origin||path(url.pathname)!==path(app.pathname)||!url.hash.startsWith('#pair='))throw new Error();
    invite=JSON.parse(decodeURIComponent(url.hash.slice(6)));
  } catch {throw new Error('Ce QR n’est pas un lien d’association de cette app MeliApp.');}
  if(!invite||!/^meliapp-[a-f0-9]{48}$/.test(invite.id)||!/^[a-f0-9]{48}$/.test(invite.secret)||!Number.isFinite(invite.expiresAt))throw new Error('QR MeliApp invalide. Génère un nouveau QR sur le Mac.');
  if(invite.expiresAt<=now||invite.expiresAt>now+11*60000)throw new Error('QR expiré. Génère un nouveau QR sur le Mac.');
  return invite;
};
const MAX_BYTES = 2000000;
const randomId = () => [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
export const shareableData = state => ({ tasks: state.features?.tasks?.items ?? [], projects: state.features?.projects?.items ?? [], energy: state.features?.energy, sessionPreferences: state.features?.sessionPreferences, events: state.calendar?.events ?? [] });
export const validatePeerData = data => Boolean(data && Array.isArray(data.tasks) && data.tasks.length <= 10000 && Array.isArray(data.projects) && data.projects.length <= 10000 && Array.isArray(data.events) && data.events.length <= 10000 && [...data.tasks, ...data.projects, ...data.events].every(item => item && typeof item === 'object' && typeof item.id === 'string' && (!item.title || typeof item.title === 'string')) && JSON.stringify(data).length <= MAX_BYTES);
export const createPeerLink = ({ load = () => import('../vendor/peer-qr.js'), now = Date.now } = {}) => {
  let peer, connection, ready = false, config = {}, secret, expiresAt, status = 'Déconnecté', role, remoteAi = false, generation = 0;
  let sequence = 0, timer;
  const pending = new Map();
  const notify = message => { status = message; config.onStatus?.({ ready, status, role, aiAvailable:role==='phone'?remoteAi:Boolean(config.aiAvailable?.()) }); };
  const close = () => {
    generation++; ready = false; remoteAi=false; clearTimeout(timer);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Appareil déconnecté.')); }
    pending.clear(); connection?.close(); peer?.destroy(); connection = null; peer = null;
  };
  const send = value => { if (!connection?.open || JSON.stringify(value).length > MAX_BYTES) throw new Error('Canal P2P indisponible ou données trop volumineuses.'); connection.send(value); };
  const sendSnapshot = () => { const data = config.getData?.(); if (!validatePeerData(data)) throw new Error('Données à partager invalides.'); send({ type: 'snapshot', data }); };
  const wire = (channel, host) => {
    connection = channel;
    let handshakeTimer;
    channel.on('open', () => {
      handshakeTimer = setTimeout(() => { if (!ready && connection === channel) channel.close(); },10000);
      if (!host) send({ type:'hello',secret });
    });
    channel.on('close', () => { clearTimeout(handshakeTimer); if (connection !== channel) return; ready = false; connection = null; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('PC déconnecté.')); } pending.clear(); notify('Appareil hors ligne. Tes données restent disponibles sur cet appareil ; l’IA du PC attend sa reconnexion.'); });
    channel.on('error', () => { ready = false; notify('Connexion interrompue. Réassocie les appareils pour reprendre.'); });
    channel.on('data', async message => {
      try {
        if (!message || typeof message !== 'object' || JSON.stringify(message).length > MAX_BYTES) throw new Error('Message P2P invalide.');
        if (!ready) {
          if (host && message.type === 'hello' && message.secret === secret && now() < expiresAt) {
            ready = true; clearTimeout(timer); clearTimeout(handshakeTimer); send({ type: 'welcome',aiAvailable:Boolean(config.aiAvailable?.()) }); notify('Téléphone associé en P2P chiffré.'); sendSnapshot();
          } else if (!host && message.type === 'welcome') { remoteAi=message.aiAvailable===true; ready = true; clearTimeout(timer); clearTimeout(handshakeTimer); notify('Ordinateur associé en P2P chiffré.'); }
          else { channel.close(); }
          return;
        }
        if(message.type==='capabilities' && !host){remoteAi=message.aiAvailable===true;notify(remoteAi?'IA disponible sur l’autre appareil.':'Appareils reliés. Aucune IA activée sur l’autre appareil.');}
        else if (message.type === 'snapshot') {
          if (!validatePeerData(message.data)) throw new Error('Données reçues invalides.');
          await config.onData?.(message.data);
        } else if (message.type === 'pull') sendSnapshot();
        else if (message.type === 'ai' && host) {
          if (!['claude', 'codex'].includes(message.provider) || typeof message.prompt !== 'string' || message.prompt.length > 16000 || typeof message.id !== 'string') throw new Error('Demande IA invalide.');
          try { send({ type: 'ai-result', id: message.id, text: await config.prompt(message.provider, message.prompt) }); }
          catch (error) { send({ type: 'ai-result', id: message.id, error: error.message }); }
        } else if (message.type === 'ai-result' && !host) {
          const request = pending.get(message.id);
          if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(message.error)) : request.resolve(String(message.text ?? '')); }
        }
      } catch (error) { notify(error.message); }
    });
  };
  const initialize = async (id = `meliapp-${randomId()}`) => {
    const { Peer } = await load();
    const currentPeer = peer = new Peer(id, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
    currentPeer.on('error', error => { if(peer!==currentPeer)return; ready = false; notify(`P2P : ${error.message}. Si les réseaux bloquent la connexion directe, réessaie sur un autre réseau.`); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service de signalisation indisponible. Réessaie plus tard.')), 20000);
      currentPeer.on('open', id => { clearTimeout(timeout); resolve(id); });
      currentPeer.on('error', error => { clearTimeout(timeout); reject(error); });
      currentPeer.on('close',()=>{clearTimeout(timeout);reject(new Error('Association annulée.'));});
    });
  };
  const startTimeout = () => { timer = setTimeout(() => { if (!ready) { close(); notify('Association expirée ou connexion directe bloquée. Génère un nouveau QR code.'); } }, 10*60000); };
  return {
    configure: options => { config = options; },
    isConnected: () => ready,
    isRemote: () => ready && role === 'phone' && remoteAi,
    refreshCapabilities:()=>{if(ready&&role==='host')send({type:'capabilities',aiAvailable:Boolean(config.aiAvailable?.())});},
    status: () => status,
    host: async origin => {
      close(); role = 'host'; secret = randomId(); expiresAt = now() + 10*60000;
      const currentGeneration=generation;
      const id=`meliapp-${randomId()}`;
      const url = new URL(origin); url.hash = 'pair=' + encodeURIComponent(JSON.stringify({ id, secret, expiresAt }));
      const { QRCode } = await load();
      const qr=await QRCode.toDataURL(url.href,{width:320,margin:2});
      if(generation!==currentGeneration)throw new Error('Association annulée.');
      notify('QR affiché · connexion au service de mise en relation…');
      startTimeout();
      initialize(id).then(()=>{
        if(generation!==currentGeneration)return;
        peer.on('connection',channel=>{if(connection){channel.close();return;}wire(channel,true);});
        notify('QR prêt pendant 10 minutes. Scanne-le avec le natel.');
      }).catch(error=>{
        if(generation!==currentGeneration)return;
        notify(`QR affiché, mais connexion indisponible : ${error.message}. Vérifie ta connexion ou un blocage du service P2P, puis regénère le QR.`);
      });
      return { url:url.href,qr,expiresAt };
    },
    join: async invite => {
      if (!invite || !/^meliapp-[a-f0-9]{48}$/.test(invite.id) || !/^[a-f0-9]{48}$/.test(invite.secret) || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= now() || invite.expiresAt > now() + 11*60000) throw new Error('QR code invalide ou expiré.');
      close(); role = 'phone'; secret = invite.secret; expiresAt = invite.expiresAt;
      await initialize(); wire(peer.connect(invite.id, { reliable: true }), false); startTimeout(); notify('Connexion directe à l’ordinateur…');
    },
    push: sendSnapshot,
    pull: () => send({ type: 'pull' }),
    prompt: (provider, prompt) => new Promise((resolve,reject) => {
      if (!ready || role !== 'phone') { reject(new Error('PC indisponible. Le planning local continue sans IA distante.')); return; }
      if(!remoteAi){reject(new Error('Aucune IA activée sur l’autre appareil. Le partage de données reste disponible.'));return;}
      const id = `request-${++sequence}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Le PC ne répond pas.')); }, 130000);
      pending.set(id, { resolve, reject, timer });
      try { send({ type: 'ai', id, provider, prompt }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    }),
    disconnect: () => { close(); notify('Liaison fermée. Les données reçues restent sauvegardées sur cet appareil.'); }
  };
};
