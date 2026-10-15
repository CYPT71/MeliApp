export const createRewardFeedback = host => {
  let previousXp;
  let previousLevel;
  let timer;
  const feedback = document.createElement('p');
  feedback.className = 'reward-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  host.append(feedback);
  return state => {
    const game = state.features?.game ?? {};
    const xp = Number(game.xp ?? 0), level = Number(game.level ?? 1);
    if (previousXp !== undefined && xp > previousXp) {
      clearTimeout(timer);
      feedback.textContent = level > previousLevel
        ? `Niveau ${level} atteint ! +${xp - previousXp} XP. Ton effort compte.`
        : `+${xp - previousXp} XP · Une avancée de plus. Tu peux aussi faire une pause.`;
      feedback.classList.add('is-visible');
      timer = setTimeout(() => { feedback.classList.remove('is-visible'); feedback.textContent = ''; }, 5500);
    }
    previousXp = xp;
    previousLevel = level;
  };
};

export const localDayKey = (value = Date.now()) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const dailyProgress = (game = {}) => {
  const completed = Object.values(game.completedAt ?? {}).filter(at => localDayKey(at) === localDayKey()).length;
  return { completed, goal: [1, 3, 5].includes(game.dailyGoal) ? game.dailyGoal : 3 };
};
