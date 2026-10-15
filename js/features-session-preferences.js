import { normalizeSessionPreferences } from './domain/session-preferences.js';
const field = (label, name, value, min, max) => {
  const wrapper = document.createElement('label'); wrapper.className = 'stack'; wrapper.append(label);
  const input = document.createElement('input'); Object.assign(input, { type:'number', name, value, min, max, required:true }); wrapper.append(input); return wrapper;
};
export const sessionPreferenceFeatures = {
  sessionPreferences: {
    description: "Durée de mes sessions",
    state: { workMinutes:52,breakMinutes:10,allowAi:true },
    when:['session-preferences:save'],
    run: ({ state, payload }) => ({ ...state, features:{...state.features, sessionPreferences:{...normalizeSessionPreferences(payload),updatedAt:new Date().toISOString()}} }),
    ui:{ order:4, render:({state})=>{
      const current=normalizeSessionPreferences(state.features.sessionPreferences);
      const form=document.createElement('form'); form.className='stack'; form.dataset.submitAction='session-preferences.save';
      const title=document.createElement('h3');title.textContent='Durée de mes sessions';
      const hint=document.createElement('p');hint.className='hint';hint.textContent='L’énergie et les créneaux disponibles peuvent raccourcir les sessions. L’IA peut proposer des durées dans tes limites. Les tâches non découpables gardent leur durée complète quand un créneau le permet.';
      const label=document.createElement('label'); const check=document.createElement('input');check.type='checkbox';check.name='allowAi';check.checked=current.allowAi;label.append(check,' Autoriser l’IA à ajuster les durées');
      const save=document.createElement('button');save.type='submit';save.dataset.action='session-preferences.save';save.textContent='Enregistrer mes durées';
      form.append(title,field('Durée maximale de travail (minutes)','workMinutes',current.workMinutes,5,120),field('Pause minimale (minutes)','breakMinutes',current.breakMinutes,2,60),label,hint,save);return form;
    }, actions:{'session-preferences.save':async({event,target,dispatch})=>{if(event.type!=='submit')return;const data=new FormData(target.form);await dispatch('session-preferences:save',{workMinutes:Number(data.get('workMinutes')),breakMinutes:Number(data.get('breakMinutes')),allowAi:data.has('allowAi')});return dispatch('adaptive-plan:refresh');}}}
  }
};
