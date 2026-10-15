const DB_NAME = "meliapp";
const STORE_NAME = "state";
const STATE_KEY = "app";

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error("Ferme les autres onglets MeliApp pour ouvrir les données."));
});

// A successful request is not enough: only transaction completion confirms durability.
const transact = async (mode, operation) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error("Sauvegarde interrompue."));
      tx.onerror = () => reject(tx.error ?? new Error("Stockage indisponible."));
      const request = operation(tx.objectStore(STORE_NAME));
      if (request) request.onsuccess = () => { result = request.result; };
    });
  } finally { db.close(); }
};

export const createIndexedDbStorage = () => ({
  load: () => transact("readonly", store => store.get(STATE_KEY)),
  async save(state) {
    await transact("readwrite", store => store.put(state, STATE_KEY));
    return state;
  },
  loadRagIndex: () => transact("readonly", store => store.get("rag-index")),
  saveRagIndex: index => transact("readwrite", store => store.put(index, "rag-index")),
  loadDrafts: () => transact("readonly", store => store.get("drafts")),
  saveDrafts: drafts => transact("readwrite", store => store.put(drafts, "drafts")),
  clear: () => transact("readwrite", store => store.clear())
});

export const createMemoryStorage = (initial = null) => {
  let value = initial;
  return {
    load: async () => value,
    save: async next => (value = next),
    clear: async () => (value = null)
  };
};
