const DB_NAME = "meliapp";
const STORE_NAME = "state";
const STATE_KEY = "app";

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const createIndexedDbStorage = () => ({
  async load() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    return requestToPromise(tx.objectStore(STORE_NAME).get(STATE_KEY));
  },
  async save(state) {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(tx.objectStore(STORE_NAME).put(state, STATE_KEY));
    return state;
  },
  async clear() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(tx.objectStore(STORE_NAME).delete(STATE_KEY));
  }
});

export const createMemoryStorage = (initial = null) => {
  let value = initial;
  return {
    load: async () => value,
    save: async (next) => (value = next),
    clear: async () => (value = null)
  };
};
