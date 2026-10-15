import { guidedFeatures } from "./features-guided.js";
import { METAFOCUS_DEFAULTS, metaPreferences, currentGuidedStep, spokenCheckpoint, exportMetafocusJournal } from "./domain/metafocus.js";
import { createCheckInScheduler, speakLocal, stopReading } from "./services/metafocus.js";

const base = guidedFeatures.guided;
const scheduler = createCheckInScheduler();
const guided = (state) => state.features?.guided ?? base.state;
const sessionFor = (feature) => feature.sessions?.[feature.activeTaskId];
const save = (state, feature) => ({ ...state, features: { ...state.features, guided: feature } });
const now = () => new Date().toISOString();
const uid = () => `metafocus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "text") element.textContent = value;
    else if (key === "className") element.className = value;
    else if (key === "value") element.value = value;
    else element.setAttribute(key, String(value));
  }
  children.filter(Boolean).forEach((child) => element.append(child));
  return element;
};
const button = (text, action, attrs = {}) => node("button", { type: "button", text, "data-action": action, ...attrs });
const checkbox = (text, name, checked) => {
  const input = node("input", { type: "checkbox", name }); input.checked = checked;
  return node("label", { className: "metafocus-option" }, [input, node("span", { text })]);
};
const logAction = (state, action) => {
  const feature = guided(state), session = sessionFor(feature);
  if (!metaPreferences(feature).journalEnabled || !session) return state;
  return save(state, { ...feature, journal: [...(feature.journal ?? []), { at: now(), taskId: session.taskId, action, stepIndex: session.steps.filter((step) => step.done).length }].slice(-500) });
};
const EVENTS = ["metafocus:create", "metafocus:settings", "metafocus:prompt", "metafocus:ack", "metafocus:reflect", "metafocus:clear-journal", "metafocus:clear-reperes"];

export const metafocusFeatures = {
  guided: {
    ...base,
    state: { ...base.state, preferences: { ...METAFOCUS_DEFAULTS }, journal: [] },
    when: [...base.when, ...EVENTS, "app:resume"],
    run: (context) => {
      let { state, event, payload } = context;
      const feature = guided(state), session = sessionFor(feature);
      if (event === "metafocus:create") {
        const title = String(payload?.title ?? "").trim().slice(0, 200);
        const steps = String(payload?.steps ?? "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean);
        if (!title || !steps.length || steps.length > 100) return save(state, { ...feature, createError: "Donne un nom et de 1 à 100 étapes à ton activité." });
        const id = uid(), stamp = now();
        const task = { id, title, status: "active", progress: 0, estimateMinutes: 25, importance: 3, difficulty: 2, source: "metafocus", createdAt: stamp, updatedAt: stamp };
        const children = steps.map((title, index) => ({ ...task, id: `${id}_${index}`, parentTaskId: id, title, estimateMinutes: 5 }));
        state = { ...state, features: { ...state.features, tasks: { ...state.features.tasks, items: [...(state.features.tasks?.items ?? []), task, ...children] } } };
        state = save(state, { ...guided(state), createError: null });
        return logAction(base.run({ ...context, state, event: "guide:start", payload: { taskId: id } }), "activite_choisie");
      }
      if (event === "metafocus:settings") {
        const preferences = { ...metaPreferences(feature) };
        for (const key of ["remindersEnabled", "journalEnabled"]) if (typeof payload?.[key] === "boolean") preferences[key] = payload[key];
        if (Number.isFinite(Number(payload?.intervalMinutes))) preferences.intervalMinutes = Math.max(2, Math.min(30, Number(payload.intervalMinutes)));
        const sessions = { ...(feature.sessions ?? {}) };
        if (session) sessions[session.taskId] = { ...session, lastCheckAt: now(), promptPending: false };
        return save(state, { ...feature, preferences, sessions, settingsSaved: true });
      }
      if (event === "metafocus:clear-journal") return save(state, { ...feature, journal: [] });
      if (event === "metafocus:clear-reperes") return save(state, { ...feature, sessions: {}, activeTaskId: null, selectedTaskId: "", journal: [], preferences: { ...metaPreferences(feature), journalEnabled: false } });
      if (event === "metafocus:prompt") {
        if (!metaPreferences(feature).remindersEnabled || session?.status !== "active" || session.promptPending || session.taskId !== payload?.taskId || currentGuidedStep(session)?.id !== payload?.stepId) return state;
        state = save(state, { ...feature, sessions: { ...feature.sessions, [session.taskId]: { ...session, promptPending: true, lastCheckAt: now() } } });
        return logAction(state, "invitation_affichee");
      }
      if (event === "metafocus:ack" || event === "metafocus:reflect") {
        if (!session || (event === "metafocus:ack" && !session.promptPending)) return state;
        const next = { ...session, promptPending: false, lastCheckAt: now() };
        if (event === "metafocus:reflect") next.reflection = String(payload?.text ?? "").trim().slice(0, 2000);
        return logAction(save(state, { ...feature, sessions: { ...feature.sessions, [session.taskId]: next } }), event === "metafocus:ack" ? "etape_confirmee_par_utilisateur" : "repere_reflexif_sauvegarde");
      }
      state = base.run(context);
      const updated = guided(state), active = sessionFor(updated);
      if (active && ["guide:resume", "guide:pause", "guide:lost", "guide:complete-step", "guide:smaller", "guide:start"].includes(event)) {
        state = save(state, { ...updated, sessions: { ...updated.sessions, [active.taskId]: { ...active, promptPending: false, lastCheckAt: now() } } });
      }
      const actions = { "guide:start": "activite_choisie", "guide:pause": "pause_choisie", "guide:lost": "perte_du_fil_declaree", "guide:resume": "reprise_choisie", "guide:smaller": "premier_geste_reduit", "guide:finish": "activite_terminee" };
      if (event === "guide:complete-step" && payload?.requestId && active?.lastCompletion?.requestId === payload?.requestId) return logAction(state, "etape_validee");
      const changed = event === "guide:start" || (event === "guide:finish" ? session?.status !== "completed" && active?.status === "completed" : session?.status !== active?.status);
      return actions[event] && changed ? logAction(state, actions[event]) : state;
    },
    ui: {
      ...base.ui,
      render: (context) => {
        const { state, dispatch } = context;
        const feature = guided(state), session = sessionFor(feature), preferences = metaPreferences(feature);
        const root = base.ui.render(context);
        root.prepend(node("p", { className: "metafocus-intro", text: "MétaFocus · garder le fil, retrouver un repère, choisir la suite." }));
        const creator = node("details", { className: "metafocus-settings", ...(feature.createError ? { open: "" } : {}) }, [node("summary", { text: "Créer une activité à étapes (recette, démarche…)" })]);
        if (feature.createError) creator.append(node("p", { role: "status", text: feature.createError }));
        creator.append(node("form", { className: "stack metafocus-create", "data-action": "metafocus.create" }, [
          node("label", { className: "field" }, [node("span", { text: "Mon activité" }), node("input", { name: "title", maxlength: 200, required: "", placeholder: "Préparer un gâteau" })]),
          node("label", { className: "field" }, [node("span", { text: "Une étape par ligne" }), node("textarea", { name: "steps", rows: 5, required: "", placeholder: "Préparer les ingrédients\nPeser la farine\nMélanger la pâte" })]),
          node("button", { type: "submit", className: "primary", text: "Commencer cette activité" })
        ]));
        root.append(creator);
        const settings = node("details", { className: "metafocus-settings" }, [node("summary", { text: "Mon accompagnement MétaFocus" })]);
        settings.append(node("form", { className: "stack", "data-action": "metafocus.settings" }, [
          node("p", { className: "muted", text: "Les invitations demandent où tu en es ; elles ne détectent pas une distraction. Elles fonctionnent pendant que cet écran reste visible." }),
          checkbox("M’inviter à faire le point", "remindersEnabled", preferences.remindersEnabled),
          node("label", { className: "field" }, [node("span", { text: "Intervalle des invitations (minutes)" }), node("input", { name: "intervalMinutes", type: "number", min: 2, max: 30, value: preferences.intervalMinutes, required: "" })]),
          checkbox("Conserver un journal local de mes essais", "journalEnabled", preferences.journalEnabled),
          node("small", { className: "muted", text: "Ce choix est facultatif. Le journal conserve au plus 500 actions horodatées, sans notes, titre, diagnostic ni enregistrement audio ou vidéo. Rien n’est envoyé automatiquement. Il ne mesure pas le début réel d’un décrochage." }),
          node("button", { type: "submit", className: "primary", text: "Enregistrer mon accompagnement" })
        ]));
        settings.append(node("div", { className: "guide-actions" }, [button("Espacer les invitations", "metafocus.space"), button("Couper les invitations", "metafocus.stop-prompts"), button("Exporter le journal local", "metafocus.export"), button("Effacer le journal", "metafocus.clear-journal"), button("Effacer mes repères Pas à pas", "metafocus.clear-reperes")]));
        settings.append(node("p", { className: "muted", text: `${(feature.journal ?? []).length} actions conservées localement. L’export ne contient que des codes de session, des dates, des types d’action et des numéros d’étape.` }));
        root.append(settings);
        if (feature.settingsSaved) root.append(node("p", { className: "metafocus-preferences-status muted", role: "status", text: `Accompagnement enregistré : invitations ${preferences.remindersEnabled ? `toutes les ${preferences.intervalMinutes} minutes` : "désactivées"} ; journal ${preferences.journalEnabled ? "activé" : "désactivé"}.` }));
        const panel = root.querySelector(".guided-panel");
        if (session && panel) {
          panel.append(node("div", { className: "guide-actions" }, [button("Où en étais-je ?", "guide.lost"), button("Lire mon repère", "metafocus.read"), button("Arrêter la lecture", "metafocus.stop-reading")]));
          panel.append(node("p", { className: "metafocus-voice-status muted", role: "status" }));
          if (session.promptPending && session.status === "active") panel.prepend(node("section", { className: "metafocus-prompt stack", role: "status" }, [
            node("h3", { text: "Où en es-tu ?" }), node("p", { text: "Tu peux continuer, retrouver le fil ou choisir une pause." }),
            node("div", { className: "guide-actions" }, [button("Toujours sur cette étape", "metafocus.ack"), button("J’ai perdu le fil", "guide.lost"), button("Je choisis une pause", "guide.pause")])
          ]));
          if (session.status === "completed") panel.append(node("details", { className: "metafocus-reflection" }, [
            node("summary", { text: "Garder ce qui m’a aidé (facultatif)" }),
            node("label", { className: "field" }, [node("span", { text: "Ce que je veux réutiliser la prochaine fois" }), node("textarea", { name: "reflection", rows: 3, value: session.reflection ?? "" })]),
            button("Garder ce repère", "metafocus.reflect"),
            node("p", { className: "metafocus-reflection-status", role: "status", text: session.reflection ? "Ton repère est sauvegardé sur cet appareil." : "Tu peux aussi terminer ici, sans répondre." })
          ]));
        }
        if (dispatch) scheduler.sync({ session, preferences, onDue: (payload) => {
          if (document.visibilityState === "visible" && document.querySelector(".guided-workspace")) dispatch("metafocus:prompt", payload);
        } });
        return root;
      },
      actions: {
        ...base.ui.actions,
        "metafocus.create": async ({ event, target, dispatch }) => {
          if (event.type !== "submit") return;
          const data = new FormData(target), title = String(data.get("title") ?? "").trim(), steps = String(data.get("steps") ?? "").trim();
          if (!title || !steps) { target.querySelector(!title ? "input" : "textarea").focus(); return; }
          await dispatch("metafocus:create", { title, steps });
        },
        "metafocus.settings": ({ event, target, dispatch }) => {
          if (event.type !== "submit") return;
          return dispatch("metafocus:settings", { remindersEnabled: target.elements.remindersEnabled.checked, intervalMinutes: Number(target.elements.intervalMinutes.value), journalEnabled: target.elements.journalEnabled.checked });
        },
        "metafocus.space": ({ state, dispatch }) => dispatch("metafocus:settings", { intervalMinutes: metaPreferences(guided(state)).intervalMinutes + 5 }),
        "metafocus.stop-prompts": ({ dispatch }) => dispatch("metafocus:settings", { remindersEnabled: false }),
        "metafocus.ack": ({ dispatch }) => dispatch("metafocus:ack"),
        "metafocus.read": ({ state, target }) => { const session = sessionFor(guided(state)); if (session) target.closest(".guided-panel").querySelector(".metafocus-voice-status").textContent = speakLocal(spokenCheckpoint(session)); },
        "metafocus.stop-reading": () => stopReading(),
        "metafocus.reflect": ({ target, dispatch }) => dispatch("metafocus:reflect", { text: target.closest(".metafocus-reflection").querySelector("textarea").value }),
        "metafocus.clear-journal": ({ dispatch }) => dispatch("metafocus:clear-journal"),
        "metafocus.clear-reperes": ({ dispatch }) => { scheduler.stop(); stopReading(); return dispatch("metafocus:clear-reperes"); },
        "metafocus.export": ({ state }) => {
          const blob = new Blob([JSON.stringify(exportMetafocusJournal(guided(state).journal ?? []), null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "metafocus-journal-local.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      }
    }
  }
};
