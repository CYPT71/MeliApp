const tasks = (state) => state.features?.tasks?.items ?? [];
const current = (state) => state.features?.guided ?? { sessions: {}, activeTaskId: null };
const update = (state, value) => ({ ...state, features: { ...state.features, guided: value } });
const activeSession = (state) => current(state).sessions?.[current(state).activeTaskId];
const nextStep = (session) => session.steps.find((step) => !step.done);
const requestId = () => `guide_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const createGuidedSession = (state, taskId) => {
  const task = tasks(state).find((item) => item.id === taskId);
  if (!task || task.status === "completed") return null;
  const steps = [], visited = new Set([taskId]);
  const visit = (parentId) => {
    for (const child of tasks(state).filter((item) => item.parentTaskId === parentId)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (tasks(state).some((item) => item.parentTaskId === child.id && !visited.has(item.id))) visit(child.id);
      else steps.push({ id: child.id, taskId: child.id, title: child.title, done: child.status === "completed" });
    }
  };
  visit(taskId);
  if (!steps.length) steps.push({ id: `step_${taskId}`, taskId: null, title: task.title, done: false });
  return { taskId, title: task.title, steps, status: "active", note: "", nextGesture: "", smallStep: "", lastCompleted: null, lastCompletion: null, savedAt: new Date().toISOString() };
};

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "text") element.textContent = value;
    else if (key === "className") element.className = value;
    else if (key === "value") element.value = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
};
const button = (text, action, attrs = {}) => node("button", { type: "button", text, "data-action": action, ...attrs });
const field = (label, name, value, session) => node("label", { className: "field" }, [node("span", { text: label }), node("textarea", { name, rows: 2, value, className: "guide-note", "data-action": "guide.edit-note", "data-session-id": session.taskId })]);
const draft = (target) => {
  const panel = target.closest(".guided-panel");
  return Object.fromEntries(["note", "nextGesture", "smallStep"].flatMap((name) => {
    const input = panel?.querySelector(`[name="${name}"]`);
    return input ? [[name, input.value]] : [];
  }));
};

export const guidedFeatures = {
  guided: {
    description: "Pas à pas",
    page: { path: "step-by-step", title: "Pas à pas", icon: "👣", order: 29 },
    state: { sessions: {}, activeTaskId: null },
    when: ["guide:start", "guide:resume", "guide:pause", "guide:lost", "guide:smaller", "guide:note", "guide:toggle-notes", "guide:complete-step", "guide:finish", "app:start", "task:completed"],
    run: ({ state, event, payload }) => {
      const feature = current(state);
      const sessions = { ...(feature.sessions ?? {}) };
      if (event === "app:start") {
        for (const [id, session] of Object.entries(sessions)) if (session.status === "active") sessions[id] = { ...session, status: "paused" };
        return update(state, { ...feature, sessions });
      }
      if (event === "guide:start") {
        const existing = sessions[payload?.taskId];
        const session = existing ?? createGuidedSession(state, payload?.taskId);
        if (!session) return state;
        if (feature.activeTaskId && sessions[feature.activeTaskId]?.status === "active" && feature.activeTaskId !== session.taskId) sessions[feature.activeTaskId] = { ...sessions[feature.activeTaskId], status: "paused" };
        sessions[session.taskId] = session;
        return update(state, { ...feature, sessions, activeTaskId: session.taskId });
      }
      if (event === "task:completed") {
        for (const [id, session] of Object.entries(sessions)) {
          sessions[id] = { ...session, ...(session.taskId === payload?.id ? { status: "completed" } : {}), steps: session.steps.map((step) => step.taskId === payload?.id ? { ...step, done: true } : step) };
        }
        return update(state, { ...feature, sessions });
      }
      const session = sessions[feature.activeTaskId];
      if (!session || session.status === "completed") return state;
      if (payload?.taskId && payload.taskId !== session.taskId) return state;
      let next = { ...session, savedAt: new Date().toISOString() };
      for (const name of ["note", "nextGesture", "smallStep"]) if (typeof payload?.[name] === "string") next[name] = payload[name].slice(0, 4000);
      if (event === "guide:toggle-notes") next.notesOpen = !session.notesOpen;
      if (event === "guide:pause") next.status = "paused";
      if (event === "guide:lost") next.status = "recovering";
      if (event === "guide:resume") next.status = "active";
      if (event === "guide:smaller") next.status = "smaller";
      if (event === "guide:complete-step") {
        const step = nextStep(session);
        if (session.status !== "active" || !step || payload?.stepId !== step.id) return state;
        if (session.smallStep) {
          next.lastCompleted = session.smallStep;
          next.smallStep = "";
          next.lastCompletion = null;
          sessions[session.taskId] = next;
          return update(state, { ...feature, sessions });
        }
        next.steps = session.steps.map((item) => item.id === step.id ? { ...item, done: true } : item);
        next.lastCompleted = step.title;
        next.smallStep = "";
        next.nextGesture = nextStep(next)?.title ?? "";
        next.lastCompletion = { requestId: payload.requestId, taskId: step.taskId };
      }
      if (event === "guide:finish") {
        if (nextStep(session)) return state;
        next.status = "completed";
        next.finishRequest = payload.requestId;
      }
      sessions[session.taskId] = next;
      return update(state, { ...feature, sessions });
    },
    ui: {
      render: ({ state }) => {
        const feature = current(state), session = activeSession(state);
        const root = node("div", { className: "guided-workspace stack" });
        if (!session) root.append(node("div", { className: "guided-empty stack" }, [
          node("h2", { text: "Une étape à la fois" }), node("p", { text: "Choisis une tâche pour garder un repère, faire une pause et retrouver le fil quand tu le souhaites." }),
          node("a", { href: "#/tasks", text: "Choisir une tâche" })
        ]));
        if (session) {
          const step = nextStep(session), rootTask = tasks(state).find((task) => task.id === session.taskId);
          const panel = node("section", { className: "guided-panel stack" }, [
            node("p", { className: "muted", text: "Mon objectif" }), node("h2", { text: session.title }),
            node("p", { className: "guide-progress", text: `${session.steps.filter((item) => item.done).length} sur ${session.steps.length} étapes terminées` })
          ]);
          if (!rootTask) panel.append(node("p", { role: "status", text: "Cette tâche a été supprimée. Ton repère reste disponible ici." }));
          if (session.status === "completed") panel.append(node("div", { className: "guide-current", role: "status" }, [node("h3", { text: "Activité terminée" }), node("p", { text: "Tu peux garder ce repère et choisir la suite." })]));
          else if (!step) panel.append(node("div", { className: "guide-current stack" }, [node("h3", { text: "Les étapes sont terminées" }), button("Terminer la tâche", "guide.finish", { className: "primary", ...(rootTask ? {} : { disabled: "disabled" }) })]));
          else {
            if (session.status !== "active") panel.append(node("div", { className: "guide-checkpoint stack", role: "status" }, [
              node("h3", { text: session.status === "paused" ? "Ton repère est sauvegardé" : session.status === "smaller" ? "Un premier geste plus petit" : "Retrouvons le fil" }),
              node("p", { text: session.lastCompleted ? `Dernière étape terminée : ${session.lastCompleted}` : "Tu peux reprendre sans recommencer depuis le début." }),
              node("p", { text: `Tu en étais à : ${step.title}` }),
              session.nextGesture ? node("p", { text: `Premier geste au retour : ${session.nextGesture}` }) : null,
              session.note ? node("p", { className: "guide-saved-note", text: session.note }) : null
            ]));
            if (session.status === "active") panel.append(node("div", { className: "guide-current stack" }, [
              node("p", { className: "muted", text: "L’étape actuelle" }), node("h3", { text: session.smallStep || step.title }),
              session.status === "active" && session.nextGesture ? node("p", { text: `Pour reprendre : ${session.nextGesture}` }) : null,
              session.status === "active" && session.note ? node("details", {}, [node("summary", { text: "Mon repère" }), node("p", { text: session.note })]) : null,
              session.status === "active" ? node("div", { className: "guide-actions" }, [
                button(session.smallStep ? "Petit geste fait" : "Étape terminée", "guide.complete-step", { className: "primary", "data-step-id": step.id }),
                button("J’ai perdu le fil", "guide.lost"), button("Faire une pause", "guide.pause")
              ]) : null
            ]));
            if (session.status !== "active") panel.append(node("div", { className: "stack" }, [
              node("div", { className: "guide-actions" }, [button("Reprendre cette étape", "guide.resume", { className: "primary" }), button("Faire plus petit", "guide.smaller")]),
              node("details", { className: "guide-notes", ...(session.notesOpen || session.status === "smaller" ? { open: "" } : {}) }, [
              node("summary", { text: "Compléter mon repère (facultatif)", "data-action": "guide.toggle-notes" }),
              field("Ce que j’ai déjà fait ou ce qu’il faut garder en tête (facultatif)", "note", session.note, session),
              field("Mon premier geste en revenant (facultatif)", "nextGesture", session.nextGesture, session),
              session.status === "smaller" ? field("Une action plus petite pour commencer", "smallStep", session.smallStep, session) : null,
              node("small", { className: "muted", text: "Tes notes sont enregistrées sur cet appareil. Une pause ne retire aucun XP." })
              ]),
              node("div", { className: "guide-actions" }, [button("Garder en pause", "guide.pause"), button("Changer d’activité", "guide.switch")])
            ]));
            panel.append(node("details", { className: "guide-upcoming" }, [node("summary", { text: "Voir les étapes" }), node("ol", {}, session.steps.map((item) => node("li", { text: `${item.done ? "✓ " : ""}${item.title}` }))) ]));
          }
          root.append(panel);
        }
        const choices = tasks(state).filter((task) => task.status !== "completed" && !task.parentTaskId && task.id !== feature.activeTaskId);
        if (choices.length) root.append(node("details", { className: "guide-task-picker" }, [node("summary", { text: "Choisir une autre activité" }), node("div", { className: "stack" }, choices.map((task) => button(`${feature.sessions?.[task.id] ? "Retrouver" : "Commencer"} · ${task.title}`, "guide.start", { "data-id": task.id }))) ]));
        return root;
      },
      actions: {
        "guide.start": async ({ target, dispatch }) => { await dispatch("guide:start", { taskId: target.dataset.id }); await dispatch("item-inspector:close"); location.hash = "#/step-by-step"; },
        ...Object.fromEntries(["pause", "lost", "resume", "smaller"].map((action) => [`guide.${action}`, ({ target, dispatch }) => dispatch(`guide:${action}`, draft(target))])),
        "guide.toggle-notes": ({ event, dispatch }) => { if (event.type === "click") { event.preventDefault(); return dispatch("guide:toggle-notes"); } },
        "guide.switch": async ({ target, dispatch }) => { await dispatch("guide:pause", draft(target)); location.hash = "#/tasks"; },
        "guide.edit-note": async ({ event, target, dispatch }) => {
          if (event.type !== "input") return;
          const focused = document.activeElement === target, start = target.selectionStart, end = target.selectionEnd;
          await dispatch("guide:note", { taskId: target.dataset.sessionId, [target.name]: target.value });
          const replacement = document.querySelector(`.guide-note[name="${target.name}"]`);
          if (focused && replacement?.dataset.sessionId === target.dataset.sessionId && document.activeElement === document.body) {
            replacement.focus({ preventScroll: true }); replacement.setSelectionRange(start, end);
          }
        },
        "guide.complete-step": async ({ target, dispatch }) => {
          const id = requestId();
          const next = await dispatch("guide:complete-step", { stepId: target.dataset.stepId, requestId: id });
          const claim = activeSession(next)?.lastCompletion;
          if (claim?.requestId === id && claim.taskId && tasks(next).some((task) => task.id === claim.taskId && task.status !== "completed")) await dispatch("task:completed", { id: claim.taskId });
        },
        "guide.finish": async ({ dispatch }) => {
          const id = requestId(), next = await dispatch("guide:finish", { requestId: id }), session = activeSession(next);
          if (session?.finishRequest === id && tasks(next).some((task) => task.id === session.taskId && task.status !== "completed")) await dispatch("task:completed", { id: session.taskId });
        }
      }
    }
  }
};
