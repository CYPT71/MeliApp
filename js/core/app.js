import { appendDiagnostic } from "./state.js";
import { featuresForEvent } from "./registry.js";

const normalizeResult = (current, result) => {
  if (result === undefined || result === null) return current;
  if (result.state) return { ...current, ...result, state: result.state };
  return { ...current, state: result };
};

export const runFeatures = async ({ event, payload, registry, context }) => {
  let current = { ...context, event, payload };

  for (const [name, feature] of featuresForEvent(registry, event, current.state)) {
    try {
      const result = await feature.run?.({ ...current, feature: name });
      current = normalizeResult(current, result);
    } catch (error) {
      current = {
        ...current,
        state: appendDiagnostic(current.state, {
          feature: name,
          event,
          message: error instanceof Error ? error.message : String(error),
          at: Date.now()
        })
      };
    }
  }

  return current;
};

export const createApp = ({ registry, initialState, services = {}, persist, onChange, onPersistenceError, onPersisted }) => {
  let state = initialState;
  let queue = Promise.resolve();

  const getState = () => state;

  const dispatch = (event, payload = undefined) => {
    queue = queue.catch(() => {}).then(async () => {
      const result = await runFeatures({
        event,
        payload,
        registry,
        context: { state, services, dispatch, getState }
      });

      state = result.state;
      if (persist) {
        try { await persist(state, { event, payload }); onPersisted?.(); }
        catch (error) { onPersistenceError?.(error); }
      }
      onChange?.(state, { event, payload });
      return state;
    });

    return queue;
  };

  const flush = async () => { await queue; if (persist) await persist(state); };
  return { dispatch, getState, flush };
};
