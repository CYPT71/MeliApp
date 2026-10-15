const MAX_BYTES = 2000000;
const randomId = () => [...crypto.getRandomValues(new Uint8Array(24))].map(v => v.toString(16).padStart(2, '0')).join('');
export const shareableData = state => ({ tasks: state.features?.tasks?.items ?? [], projects: state.features?.projects?.items ?? [], energy: state.features?.energy, sessionPreferences: state.features?.sessionPreferences, events: state.calendar?.events ?? [] });
export const validatePeerData = data => Boolean(data && Array.isArray(data.tasks) && data.tasks.length <= 10000 && Array.isArray(data.projects) && data.projects.length <= 10000 && Array.isArray(data.events) && data.events.length <= 10000 && [...data.tasks, ...data.projects, ...data.events].every(item => item && typeof item === 'object' && typeof item.id === 'string' && (!item.title || typeof item.title === 'string')) && JSON.stringify(data).length <= MAX_BYTES);
export const createPeerLink = ({ load = () => import('../vendor/peer-qr.js'), now = Date.now } = {}) => {
  let peer, connection, ready = false, config = {}, secret, expiresAt, status = 'Déconnecté', role;
  let sequence = 0, timer;
  const pending = new Map();
  const notify = message => { status = message; config.onStatus?.({ ready, status, role }); };
  const close = () => {
    ready = false; clearTimeout(timer);
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
            ready = true; clearTimeout(timer); clearTimeout(handshakeTimer); send({ type: 'welcome' }); notify('Téléphone associé en P2P chiffré.'); sendSnapshot();
          } else if (!host && message.type === 'welcome') { ready = true; clearTimeout(timer); clearTimeout(handshakeTimer); notify('Ordinateur associé en P2P chiffré.'); }
          else { channel.close(); }
          return;
        }
        if (message.type === 'snapshot') {
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
  const initialize = async () => {
    const { Peer } = await load();
    peer = new Peer(`meliapp-${randomId()}`, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
    peer.on('error', error => { ready = false; notify(`P2P : ${error.message}. Si les réseaux bloquent la connexion directe, réessaie sur un autre réseau.`); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service de signalisation indisponible. Réessaie plus tard.')), 20000);
      peer.on('open', id => { clearTimeout(timeout); resolve(id); });
      peer.on('error', error => { clearTimeout(timeout); reject(error); });
    });
  };
  const startTimeout = () => { timer = setTimeout(() => { if (!ready) { close(); notify('Association expirée ou connexion directe bloquée. Génère un nouveau QR code.'); } }, 10*60000); };
  return {
    configure: options => { config = options; },
    isConnected: () => ready,
    isRemote: () => ready && role === 'phone',
    status: () => status,
    host: async origin => {
      close(); role = 'host'; secret = randomId(); expiresAt = now() + 10*60000;
      await initialize();
      peer.on('connection', channel => { if (connection) { channel.close(); return; } wire(channel, true); });
      startTimeout(); notify('QR prêt pendant 10 minutes. Scanne-le avec le natel.');
      const url = new URL(origin); url.hash = 'pair=' + encodeURIComponent(JSON.stringify({ id: peer.id, secret, expiresAt }));
      const { QRCode } = await load();
      return { url: url.href, qr: await QRCode.toDataURL(url.href, { width: 320, margin: 2 }), expiresAt };
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
      const id = `request-${++sequence}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Le PC ne répond pas.')); }, 130000);
      pending.set(id, { resolve, reject, timer });
      try { send({ type: 'ai', id, provider, prompt }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    }),
    disconnect: () => { close(); notify('Liaison fermée. Les données reçues restent sauvegardées sur cet appareil.'); }
  };
};
