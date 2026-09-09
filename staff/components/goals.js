const Goals = {
  render(container) {
    const goals = DataStore.getCompanyGoals();
    const active = goals.filter(goal => !goal.completed); const completed = goals.filter(goal => goal.completed);
    let html = `<div class="sp-tab-content"><div class="sp-section-header"><h2 class="sp-section-title">COMPANY GOALS</h2>${App.can('assign_goals') ? '<button class="sp-btn sp-btn-primary" onclick="App.openAddGoalModal(\'team\')">+ Add Goal</button>' : ''}</div>`;
    html += `<div class="sp-card" style="margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap;"><div><strong>${active.length}</strong> active</div><div><strong>${completed.length}</strong> completed</div><div><strong>${active.filter(goal => goal.importance === 'high').length}</strong> high priority</div></div>`;
    if (!goals.length) html += '<div class="sp-empty">No company goals yet.</div>';
    if (active.length) html += '<div class="sp-subheading">ACTIVE</div>' + active.map(goal => this.card(goal)).join('');
    if (completed.length) html += '<div class="sp-subheading">COMPLETED</div>' + completed.map(goal => this.card(goal)).join('');
    container.innerHTML = html + '</div>';
  },
  card(goal) {
    const days = Utils.daysUntil(goal.deadline); const overdue = days < 0 && !goal.completed;
    return `<div class="sp-goal-card ${goal.completed ? 'completed' : ''}"><div class="sp-goal-header"><div class="sp-goal-title ${goal.completed ? 'completed' : ''}">${Utils.escapeHtml(goal.title)}</div>${goal.importance ? `<span class="sp-badge sp-priority-${goal.importance}">${goal.importance}</span>` : ''}</div>${goal.description ? `<div class="sp-goal-desc">${Utils.escapeHtml(goal.description)}</div>` : ''}<div class="sp-goal-meta"><span>📅 ${Utils.formatDate(goal.deadline)}</span>${overdue ? '<span style="color:var(--sp-red)">Overdue</span>' : !goal.completed ? `<span>${days} day${days === 1 ? '' : 's'} left</span>` : ''}</div><div class="sp-goal-actions">${!goal.completed ? `<button class="complete-btn" onclick="Goals.toggleGoal('${goal.id}',true)">✓ Complete</button>` : `<button class="complete-btn" onclick="Goals.toggleGoal('${goal.id}',false)">↩ Undo</button>`}${App.can('assign_goals') ? `<button class="edit-btn" onclick="Goals.editGoal('${goal.id}')">Edit</button><button class="delete-btn" onclick="Goals.deleteGoal('${goal.id}')">Delete</button>` : ''}</div></div>`;
  },
  toggleGoal(id, completed) { DataStore.updateGoal('team', id, '', { completed, completedAt: completed ? new Date().toISOString() : null }); this.render(document.getElementById('main-content')); },
  editGoal(id) { const goal = DataStore.getCompanyGoals().find(item => item.id === id); if (goal) { goal._type = 'team'; App.openEditGoalModal(goal); } },
  deleteGoal(id) { if (confirm('Delete this company goal?')) { DataStore.deleteGoal('team', id, ''); this.render(document.getElementById('main-content')); } }
};
