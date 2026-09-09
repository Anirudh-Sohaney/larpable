/**
 * LARPABLE Staff Portal — Tasks Component
 * 
 * Task management with status workflow, assignment, and filtering.
 * 
 * INTEGRATION:
 *   Tasks: GET /api/staff/tasks?scope=my|team|all
 *   Add: POST /api/staff/tasks (admin only)
 *   Update: PATCH /api/staff/tasks/:id (assignee can update status)
 *   Delete: DELETE /api/staff/tasks/:id (admin only)
 *   Source: data/staff.json -> tasks (new section)
 */

const Tasks = {
  render(container) {
    const tasks = DataStore.getTasks(App.tasksScope, App.tasksFilter);
    const allTasks = DataStore.getTasks(App.tasksScope);

    let html = `<div class="sp-tab-content">`;

    // ── Header
    html += `
      <div class="sp-section-header">
        <h2 class="sp-section-title">TASKS</h2>
        ${App.can('assign_tasks') ? '<button class="sp-btn sp-btn-primary" onclick="App.openAddTaskModal()">+ Add Task</button>' : ''}
      </div>
    `;

    // ── Scope Tabs
    html += `
      <div class="sp-filter-bar">
        <button class="sp-filter-btn ${App.tasksScope === 'my' ? 'active' : ''}" onclick="Tasks.setScope('my')">My Tasks</button>
        <button class="sp-filter-btn ${App.tasksScope === 'all' ? 'active' : ''}" onclick="Tasks.setScope('all')">All Tasks</button>
      </div>
    `;

    // ── Status Filter
    html += `
      <div class="sp-filter-bar" style="margin-bottom:16px;">
        <button class="sp-filter-btn ${App.tasksFilter === 'all' ? 'active' : ''}" onclick="Tasks.setFilter('all')">All (${allTasks.length})</button>
        <button class="sp-filter-btn ${App.tasksFilter === 'todo' ? 'active' : ''}" onclick="Tasks.setFilter('todo')">To Do (${allTasks.filter(t => t.status === 'todo').length})</button>
        <button class="sp-filter-btn ${App.tasksFilter === 'in_progress' ? 'active' : ''}" onclick="Tasks.setFilter('in_progress')">In Progress (${allTasks.filter(t => t.status === 'in_progress').length})</button>
        <button class="sp-filter-btn ${App.tasksFilter === 'review' ? 'active' : ''}" onclick="Tasks.setFilter('review')">Review (${allTasks.filter(t => t.status === 'review').length})</button>
        <button class="sp-filter-btn ${App.tasksFilter === 'done' ? 'active' : ''}" onclick="Tasks.setFilter('done')">Done (${allTasks.filter(t => t.status === 'done').length})</button>
      </div>
    `;

    // ── Task List
    if (tasks.length === 0) {
      html += '<div class="sp-empty">No tasks match this filter.</div>';
    } else {
      tasks.forEach(task => {
        const daysLeft = Utils.daysUntil(task.dueDate);
        const isOverdue = daysLeft < 0 && task.status !== 'done';
        const isDueSoon = daysLeft >= 0 && daysLeft <= 2 && task.status !== 'done';

        let dueDateStyle = '';
        if (isOverdue) dueDateStyle = 'color:var(--sp-red); font-weight:600;';
        else if (isDueSoon) dueDateStyle = 'color:var(--sp-yellow); font-weight:600;';

        html += `
          <div class="sp-task-card">
            <div class="sp-task-header">
              <div class="sp-task-title">${Utils.escapeHtml(task.title)}</div>
              <div style="display:flex; gap:6px;">
                <span class="sp-badge sp-priority-${task.priority}">${task.priority}</span>
                <span class="sp-badge sp-status-${task.status}">${Utils.statusLabel(task.status)}</span>
              </div>
            </div>
            ${task.description ? `<div class="sp-task-desc">${Utils.escapeHtml(task.description)}</div>` : ''}
            <div class="sp-task-meta">
              <span>&#128100; ${Utils.escapeHtml((task.assigneeNames || [task.assigneeName]).filter(Boolean).join(', ') || 'Unassigned')}</span>
              <span style="${dueDateStyle}">&#128197; ${Utils.formatDate(task.dueDate)}${isOverdue ? ' (overdue)' : isDueSoon ? ' (soon)' : ''}</span>
            </div>
            <div class="sp-task-actions">
              <select onchange="Tasks.updateStatus('${task.id}', this.value)">
                <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
                <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="review" ${task.status === 'review' ? 'selected' : ''}>In Review</option>
                <option value="done" ${task.status === 'done' ? 'selected' : ''}>Done</option>
              </select>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;
  },

  setScope(scope) {
    App.tasksScope = scope;
    this.render(document.getElementById('main-content'));
  },

  setFilter(filter) {
    App.tasksFilter = filter;
    this.render(document.getElementById('main-content'));
  },

  updateStatus(taskId, newStatus) {
    // INTEGRATION: PATCH /api/staff/tasks/:id { status: newStatus }
    // Auth: assignee can update their own tasks' status; admin can update any
    DataStore.updateTask(taskId, { status: newStatus });
    this.render(document.getElementById('main-content'));
  }
};
