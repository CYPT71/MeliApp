const KEY = 'meliapp:cli-ai:token';
export const createCliAiService = ({ fetchFn = globalThis.fetch, storage = globalThis.sessionStorage } = {}) => {
  let connected = false;
  const endpoint = () => storage.getItem('meliapp:cli-ai:url') || (globalThis.location?.port === '8766' ? globalThis.location.origin : 'http://127.0.0.1:8766');
  const request = async (path, body, method) => {
    const token = storage.getItem(KEY);
    if (!token) throw new Error('Associe d’abord la passerelle avec le code du terminal.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 125000);
    try {
      const response = await fetchFn(`${endpoint()}${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Passerelle : erreur ${response.status}`);
      return data;
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Passerelle inaccessible. Lance la commande sur cet ordinateur, vérifie l’origine autorisée et autorise l’accès au réseau local dans ton navigateur.');
      if (error.name === 'AbortError') throw new Error('Le CLI met trop de temps à répondre.');
      throw error;
    } finally { clearTimeout(timer); }
  };
  return {
    connect: async (token, url) => {
      if (url) {
        const parsed = new URL(url);
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Adresse de passerelle invalide.');
        storage.setItem('meliapp:cli-ai:url', parsed.origin);
      } storage.setItem(KEY, String(token).trim()); connected = false; const health = await request('/health'); if (health.app !== 'meliapp-cli') throw new Error('Passerelle incompatible.'); connected = true; },
    disconnect: () => { connected = false; storage.removeItem(KEY); },
    endpoint,
    isConnected: () => connected,
    prompt: async (provider, prompt) => { if (!connected) throw new Error('Connecte la passerelle.'); const data = await request('/prompt', { provider, prompt }); return data.text; }
  };
};
