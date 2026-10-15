import { advancedFeatures } from "./features-advanced.js";

const base = advancedFeatures.dataManager;
const peers = new Map();
const CHUNK_SIZE = 12000;

const featureState = (state) => state.features?.dataManager ?? {};
const setDataManager = (state, patch) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    dataManager: { ...featureState(state), ...patch }
  }
});

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "value") element.value = value;
    else if (key === "readonly") element.readOnly = Boolean(value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const button = (label, action, attrs = {}) => node("button", { type: "button", "data-action": action, ...attrs, text: label });

const toBase64Url = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const normalized = String(value ?? "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const encodePeerSignal = (description) => toBase64Url(JSON.stringify(description));
export const decodePeerSignal = (code) => JSON.parse(fromBase64Url(code));

const waitForIce = (peer, timeoutMs = 8000) => {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === "complete") done();
    }
    peer.addEventListener("icegatheringstatechange", onChange);
  });
};

const closePeer = (role) => {
  const current = peers.get(role);
  if (!current) return;
  try { current.channel?.close(); } catch {}
  try { current.peer?.close(); } catch {}
  peers.delete(role);
};

const transferableState = (state) => {
  const snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.auth;
  if (snapshot.features?.dataManager) {
    snapshot.features.dataManager = {
      lastImportAt: snapshot.features.dataManager.lastImportAt ?? null,
      error: null
    };
  }
  return snapshot;
};

const waitForBuffer = async (channel) => {
  while (channel.bufferedAmount > 256000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const sendSnapshot = async (channel, state, dispatch) => {
  const payload = JSON.stringify(transferableState(state));
  const chunks = [];
  for (let index = 0; index < payload.length; index += CHUNK_SIZE) chunks.push(payload.slice(index, index + CHUNK_SIZE));
  const transferId = `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  channel.send(JSON.stringify({ type: "meliapp:start", id: transferId, chunks: chunks.length }));
  for (let index = 0; index < chunks.length; index += 1) {
    await waitForBuffer(channel);
    channel.send(JSON.stringify({ type: "meliapp:chunk", id: transferId, index, value: chunks[index] }));
  }
  await waitForBuffer(channel);
  channel.send(JSON.stringify({ type: "meliapp:end", id: transferId }));
  await dispatch("data:p2p:status", { status: `Données envoyées (${chunks.length} bloc${chunks.length > 1 ? "s" : ""}).`, error: null });
};

const wireReceiverChannel = (channel, dispatch) => {
  const transfers = new Map();
  channel.addEventListener("open", () => dispatch("data:p2p:status", { status: "Connexion locale établie. En attente des données…", error: null }));
  channel.addEventListener("close", () => dispatch("data:p2p:status", { status: "Connexion locale fermée." }));
  channel.addEventListener("error", () => dispatch("data:p2p:status", { error: "Erreur sur le canal P2P local." }));
  channel.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "meliapp:start") {
        transfers.set(message.id, { chunks: new Array(Number(message.chunks) || 0), expected: Number(message.chunks) || 0 });
        await dispatch("data:p2p:status", { status: "Réception des données…", error: null });
        return;
      }
      const transfer = transfers.get(message.id);
      if (!transfer) return;
      if (message.type === "meliapp:chunk") {
        transfer.chunks[Number(message.index)] = String(message.value ?? "");
        return;
      }
      if (message.type === "meliapp:end") {
        if (transfer.chunks.filter((item) => typeof item === "string").length !== transfer.expected) throw new Error("Transfert incomplet");
        const incoming = JSON.parse(transfer.chunks.join(""));
        transfers.delete(message.id);
        await dispatch("data:import", { state: incoming });
        await dispatch("data:p2p:received", { receivedAt: new Date().toISOString() });
      }
    } catch (error) {
      await dispatch("data:p2p:status", { error: error instanceof Error ? error.message : String(error) });
    }
  });
};

const p2pPanel = (state) => {
  const current = featureState(state);
  const p2p = current.p2p ?? {};
  const root = node("section", { className: "stack list-item" });
  root.append(
    node("h3", { text: "📡 Transfert P2P local" }),
    node("p", { className: "muted", text: "Transfère les données directement entre deux appareils proches avec WebRTC. Aucun serveur MeliApp ne reçoit la sauvegarde. Les deux appareils doivent garder cette page ouverte pendant l’échange." })
  );

  if (!("RTCPeerConnection" in globalThis)) {
    root.append(node("p", { className: "error", text: "Ce navigateur ne prend pas en charge WebRTC P2P." }));
    return root;
  }

  const send = node("div", { className: "stack" }, [
    node("strong", { text: "Envoyer depuis cet appareil" }),
    button("1. Préparer l’envoi", "data.p2p.sender-start", { className: "primary" })
  ]);
  if (p2p.offerCode) {
    send.append(
      node("label", { className: "field" }, [node("span", { text: "Code d’offre à copier sur l’autre appareil" }), node("textarea", { id: "p2p-offer-code", rows: 4, readonly: true, value: p2p.offerCode })]),
      button("Copier le code d’offre", "data.p2p.copy", { "data-copy": "p2p-offer-code" }),
      node("label", { className: "field" }, [node("span", { text: "Code de réponse reçu" }), node("textarea", { id: "p2p-answer-input", rows: 4, placeholder: "Colle ici le code de réponse de l’autre appareil" })]),
      button("3. Connecter et envoyer", "data.p2p.sender-connect")
    );
  }

  const receive = node("div", { className: "stack" }, [
    node("strong", { text: "Recevoir sur cet appareil" }),
    node("label", { className: "field" }, [node("span", { text: "Code d’offre reçu" }), node("textarea", { id: "p2p-offer-input", rows: 4, placeholder: "Colle ici le code d’offre de l’appareil qui envoie" })]),
    button("2. Préparer la réception", "data.p2p.receiver-start", { className: "primary" })
  ]);
  if (p2p.answerCode) {
    receive.append(
      node("label", { className: "field" }, [node("span", { text: "Code de réponse à renvoyer" }), node("textarea", { id: "p2p-answer-code", rows: 4, readonly: true, value: p2p.answerCode })]),
      button("Copier le code de réponse", "data.p2p.copy", { "data-copy": "p2p-answer-code" })
    );
  }

  root.append(send, receive);
  if (p2p.status) root.append(node("p", { className: "hint", role: "status", text: p2p.status }));
  if (p2p.error) root.append(node("p", { className: "error", role: "alert", text: p2p.error }));
  if (p2p.receivedAt) root.append(node("small", { className: "muted", text: `Dernier transfert reçu : ${new Date(p2p.receivedAt).toLocaleString("fr-FR")}` }));
  root.append(node("small", { className: "muted", text: "Les connexions Outlook/Spotify et les jetons de session ne sont pas transférés. Chaque appareil garde ses propres connexions." }));
  return root;
};

export const dataP2pOverride = {
  dataManager: {
    ...base,
    description: "Données locales et transfert P2P",
    state: { ...(base.state ?? {}), p2p: { offerCode: null, answerCode: null, status: null, error: null, receivedAt: null } },
    when: [...new Set([...(base.when ?? []), "data:p2p:offer-ready", "data:p2p:answer-ready", "data:p2p:status", "data:p2p:received"])],
    run: ({ state, event, payload }) => {
      if (["data:import", "data:reset"].includes(event)) {
        const previousP2p = featureState(state).p2p ?? {};
        const next = base.run({ state, event, payload });
        return setDataManager(next, { p2p: previousP2p });
      }
      const current = featureState(state);
      const p2p = current.p2p ?? {};
      if (event === "data:p2p:offer-ready") return setDataManager(state, { p2p: { ...p2p, offerCode: payload?.code ?? null, answerCode: null, status: "Offre prête. Copie-la sur l’appareil receveur.", error: null } });
      if (event === "data:p2p:answer-ready") return setDataManager(state, { p2p: { ...p2p, answerCode: payload?.code ?? null, status: "Réponse prête. Renvoie-la à l’appareil qui envoie.", error: null } });
      if (event === "data:p2p:status") return setDataManager(state, { p2p: { ...p2p, status: payload?.status ?? p2p.status ?? null, error: payload?.error ?? null } });
      if (event === "data:p2p:received") return setDataManager(state, { p2p: { ...p2p, receivedAt: payload?.receivedAt ?? new Date().toISOString(), status: "Données reçues et importées.", error: null } });
      return state;
    },
    ui: {
      ...(base.ui ?? {}),
      render: ({ state }) => {
        const root = node("div", { className: "stack" });
        root.append(base.ui.render({ state }), p2pPanel(state));
        return root;
      },
      actions: {
        ...(base.ui?.actions ?? {}),
        "data.p2p.copy": async ({ target, dispatch }) => {
          const id = target.dataset.copy;
          const value = document.getElementById(id)?.value ?? "";
          try {
            await navigator.clipboard.writeText(value);
            return dispatch("data:p2p:status", { status: "Code copié dans le presse-papiers.", error: null });
          } catch {
            return dispatch("data:p2p:status", { error: "Copie automatique impossible. Sélectionne le code puis copie-le manuellement." });
          }
        },
        "data.p2p.sender-start": async ({ dispatch }) => {
          try {
            closePeer("sender");
            const peer = new RTCPeerConnection({ iceServers: [] });
            const channel = peer.createDataChannel("meliapp-data", { ordered: true });
            peers.set("sender", { peer, channel });
            channel.addEventListener("open", () => dispatch("data:p2p:status", { status: "Connexion locale établie. Envoi prêt…", error: null }));
            channel.addEventListener("close", () => dispatch("data:p2p:status", { status: "Connexion locale fermée." }));
            channel.addEventListener("error", () => dispatch("data:p2p:status", { error: "Erreur sur le canal P2P local." }));
            await peer.setLocalDescription(await peer.createOffer());
            await waitForIce(peer);
            return dispatch("data:p2p:offer-ready", { code: encodePeerSignal(peer.localDescription) });
          } catch (error) {
            closePeer("sender");
            return dispatch("data:p2p:status", { error: `Impossible de préparer l’envoi P2P : ${error instanceof Error ? error.message : String(error)}` });
          }
        },
        "data.p2p.receiver-start": async ({ dispatch }) => {
          try {
            closePeer("receiver");
            const offerCode = document.getElementById("p2p-offer-input")?.value ?? "";
            const offer = decodePeerSignal(offerCode);
            if (offer?.type !== "offer") throw new Error("Code d’offre invalide");
            const peer = new RTCPeerConnection({ iceServers: [] });
            peers.set("receiver", { peer, channel: null });
            peer.addEventListener("datachannel", (event) => {
              peers.set("receiver", { peer, channel: event.channel });
              wireReceiverChannel(event.channel, dispatch);
            });
            await peer.setRemoteDescription(offer);
            await peer.setLocalDescription(await peer.createAnswer());
            await waitForIce(peer);
            return dispatch("data:p2p:answer-ready", { code: encodePeerSignal(peer.localDescription) });
          } catch (error) {
            closePeer("receiver");
            return dispatch("data:p2p:status", { error: `Impossible de préparer la réception P2P : ${error instanceof Error ? error.message : String(error)}` });
          }
        },
        "data.p2p.sender-connect": async ({ state, dispatch }) => {
          try {
            const current = peers.get("sender");
            if (!current?.peer || !current.channel) throw new Error("Prépare d’abord l’envoi");
            const answerCode = document.getElementById("p2p-answer-input")?.value ?? "";
            const answer = decodePeerSignal(answerCode);
            if (answer?.type !== "answer") throw new Error("Code de réponse invalide");
            await current.peer.setRemoteDescription(answer);
            const channel = current.channel;
            if (channel.readyState === "open") return sendSnapshot(channel, state, dispatch);
            await dispatch("data:p2p:status", { status: "Connexion locale en cours…", error: null });
            channel.addEventListener("open", () => sendSnapshot(channel, state, dispatch), { once: true });
          } catch (error) {
            return dispatch("data:p2p:status", { error: `Impossible de connecter les appareils : ${error instanceof Error ? error.message : String(error)}` });
          }
        }
      }
    }
  }
};
