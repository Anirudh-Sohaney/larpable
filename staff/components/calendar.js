/**
 * LARPABLE Staff Portal — Calendar Component
 * 
 * Month and week calendar views with events, filters, and day detail.
 * 
 * INTEGRATION:
 *   Events: GET /api/staff/calendar?month=YYYY-MM&scope=company|team|individual
 *   Add: POST /api/staff/calendar (admin only)
 *   Edit: PATCH /api/staff/calendar/:id (admin only)
 *   Delete: DELETE /api/staff/calendar/:id (admin only)
 *   Source: data/staff.json -> calendar_events
 */

const Calendar = {
  render(container) {
    const month = App.calendarDate;
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const events = DataStore.getCalendarEvents(monthKey);

    let html = `<div class="sp-tab-content">`;

    // ── Header with nav and view switcher
    html += `
      <div class="sp-calendar-header">
        <div class="sp-calendar-nav">
          <button onclick="Calendar.prevMonth()">&larr;</button>
          <span class="sp-calendar-month">${month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
          <button onclick="Calendar.nextMonth()">&rarr;</button>
          <button onclick="Calendar.goToday()" style="margin-left:8px;">Today</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="sp-calendar-views">
            <button class="${App.calendarView === 'month' ? 'active' : ''}" onclick="Calendar.setView('month')">Month</button>
            <button class="${App.calendarView === 'week' ? 'active' : ''}" onclick="Calendar.setView('week')">Week</button>
          </div>
          ${App.can('modify_calendar') ? '<button class="sp-btn sp-btn-primary" onclick="App.openAddEventModal()">+ Event</button>' : ''}
        </div>
      </div>
    `;

    // ── Calendar Grid
    if (App.calendarView === 'month') {
      html += this.renderMonthGrid(month, events);
    } else {
      html += this.renderWeekGrid(month, events);
    }

    // ── Legend
    html += `
      <div style="display:flex; gap:16px; margin-top:12px; font-size:0.75rem; color:var(--sp-muted); flex-wrap:wrap;">
        <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--sp-indigo); margin-right:4px;"></span> Meeting</span>
        <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--sp-green); margin-right:4px;"></span> Milestone</span>
        <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--sp-red); margin-right:4px;"></span> Deadline</span>
      </div>
    `;

    html += `</div>`;
    container.innerHTML = html;
  },

  renderMonthGrid(month, events) {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Events indexed by date
    const eventsByDate = {};
    events.forEach(evt => {
      if (!eventsByDate[evt.date]) eventsByDate[evt.date] = [];
      eventsByDate[evt.date].push(evt);
    });

    let html = `<div class="sp-calendar-grid">`;

    // Day headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
      html += `<div class="sp-calendar-day-header">${d}</div>`;
    });

    // Previous month padding
    const prevMonth = new Date(year, m, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i;
      html += `<div class="sp-calendar-day other-month"><div class="sp-calendar-day-num">${day}</div></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayEvents = eventsByDate[dateStr] || [];

      html += `<div class="sp-calendar-day ${isToday ? 'today' : ''}" onclick="Calendar.showDay('${dateStr}')">`;
      html += `<div class="sp-calendar-day-num">${day}</div>`;

      dayEvents.slice(0, 3).forEach(evt => {
        html += `<div class="sp-calendar-event ${evt.type}" title="${Utils.escapeHtml(evt.title)}">${Utils.escapeHtml(evt.title)}</div>`;
      });
      if (dayEvents.length > 3) {
        html += `<div style="font-size:0.58rem; color:var(--sp-muted);">+${dayEvents.length - 3} more</div>`;
      }

      html += `</div>`;
    }

    // Next month padding
    const totalCells = startDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="sp-calendar-day other-month"><div class="sp-calendar-day-num">${i}</div></div>`;
    }

    html += `</div>`;
    return html;
  },

  renderWeekGrid(month, events) {
    const today = new Date();
    const startOfWeek = new Date(App.calendarDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Get 7 days of the week
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    // Events indexed by date
    const eventsByDate = {};
    events.forEach(evt => {
      if (!eventsByDate[evt.date]) eventsByDate[evt.date] = [];
      eventsByDate[evt.date].push(evt);
    });

    // Time slots from 8am to 8pm
    const hours = [];
    for (let h = 8; h <= 20; h++) {
      hours.push(h);
    }

    let html = `<div class="sp-week-grid">`;

    // Header row: empty corner + day columns
    html += `<div class="sp-week-header"></div>`;
    days.forEach(d => {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      html += `<div class="sp-week-header ${isToday ? 'today' : ''}">${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>`;
    });

    // Time rows
    hours.forEach(h => {
      const timeStr = `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
      html += `<div class="sp-week-time">${timeStr}</div>`;

      days.forEach(d => {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayEvents = (eventsByDate[dateStr] || []).filter(evt => {
          if (!evt.time) return h === 9; // Default position
          const evtHour = parseInt(evt.time.split(':')[0]);
          return evtHour === h;
        });

        html += `<div class="sp-week-cell">`;
        dayEvents.forEach(evt => {
          const color = {
            meeting: 'var(--sp-indigo)',
            milestone: 'var(--sp-green)',
            deadline: 'var(--sp-red)'
          }[evt.type] || 'var(--sp-muted)';
          html += `<div class="sp-week-event" style="background:${color};">${Utils.escapeHtml(evt.title)}</div>`;
        });
        html += `</div>`;
      });
    });

    html += `</div>`;
    return html;
  },

  prevMonth() {
    App.calendarDate.setMonth(App.calendarDate.getMonth() - 1);
    this.render(document.getElementById('main-content'));
  },

  nextMonth() {
    App.calendarDate.setMonth(App.calendarDate.getMonth() + 1);
    this.render(document.getElementById('main-content'));
  },

  goToday() {
    App.calendarDate = new Date();
    this.render(document.getElementById('main-content'));
  },

  setView(view) {
    App.calendarView = view;
    this.render(document.getElementById('main-content'));
  },

  showDay(dateStr) {
    // INTEGRATION: Events for a specific day from GET /api/staff/calendar?date=YYYY-MM-DD
    const events = DataStore.getCalendarEvents().filter(e => e.date === dateStr);
    const date = new Date(dateStr + 'T12:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    document.getElementById('day-modal-title').textContent = formatted;

    let content = '';
    if (events.length === 0) {
      content = `<div class="sp-empty" style="padding:20px;">No events on this day.</div>`;
    } else {
      events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      events.forEach(evt => {
        const color = {
          meeting: 'var(--sp-indigo)',
          milestone: 'var(--sp-green)',
          deadline: 'var(--sp-red)'
        }[evt.type] || 'var(--sp-muted)';

        content += `
          <div class="sp-card" style="border-left:3px solid ${color}; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <div style="font-weight:600; font-size:0.9rem;">${Utils.escapeHtml(evt.title)}</div>
                <div style="font-size:0.78rem; color:var(--sp-muted); margin-top:4px;">
                  ${Utils.formatTime(evt.time)}${evt.duration ? ' · ' + evt.duration + ' min' : ''}
                </div>
              </div>
              <span class="sp-badge" style="background:${color}20; color:${color};">${evt.type}</span>
            </div>
            ${evt.description ? `<div style="font-size:0.82rem; color:var(--sp-muted); margin-top:8px;">${Utils.escapeHtml(evt.description)}</div>` : ''}
          </div>
        `;
      });
    }

    document.getElementById('day-modal-content').innerHTML = content;
    App.openModal('day-modal');
  }
};
