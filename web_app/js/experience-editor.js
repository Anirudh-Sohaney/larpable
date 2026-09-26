/* Shared signup/profile editor. The server remains the authority for validation. */
const ExperienceEditor = {
  editors: new Map(),

  mount(containerId, initial = [], skills = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="d-experience-list"></div><button class="d-btn d-btn-secondary d-experience-add" type="button">+ Add experience</button><p class="d-experience-hint">Up to 5 projects, internships, or jobs.</p>';
    const editor = { container, skills: [...new Set(skills)].sort(), list: container.querySelector('.d-experience-list') };
    this.editors.set(containerId, editor);
    container.querySelector('.d-experience-add').addEventListener('click', () => this.add(containerId));
    (Array.isArray(initial) ? initial : []).forEach(item => this.add(containerId, item, true));
    this.sync(editor);
  },

  setSkills(containerId, skills) {
    const editor = this.editors.get(containerId);
    if (!editor) return;
    editor.skills = [...new Set(skills)].sort();
    editor.container.querySelectorAll('.d-experience-skills input:focus').forEach(input => input.dispatchEvent(new Event('input')));
  },

  add(containerId, item = {}, restoring = false) {
    const editor = this.editors.get(containerId);
    if (!editor || (!restoring && editor.list.children.length >= 5)) return;
    const card = document.createElement('div');
    card.className = 'd-experience-card';
    card.innerHTML = `
      <div class="d-experience-heading"><strong>Experience <span class="d-experience-number"></span></strong><button type="button" class="d-experience-remove" aria-label="Remove experience">Remove</button></div>
      <label class="d-label">Type</label><select class="d-input d-experience-type"><option value="project">Project</option><option value="internship">Internship</option><option value="job">Job</option></select>
      <label class="d-label">Title</label><input class="d-input d-experience-title" type="text" maxlength="120" placeholder="Project or role title">
      <div class="d-experience-company-wrap"><label class="d-label">Company name</label><input class="d-input d-experience-company" type="text" maxlength="120" placeholder="Company name"></div>
      <label class="d-label">Description <span class="d-experience-word-count">0 / 150 words</span></label><textarea class="d-input d-experience-description" rows="4" placeholder="Describe what you did in 10–150 words"></textarea>
      <label class="d-label">Relevant skills <span style="font-weight:400">(1–3)</span></label><div class="d-experience-skills">${[1, 2, 3].map(number => `<div class="d-autocomplete-wrap"><input class="d-autocomplete-search" type="text" maxlength="120" placeholder="Skill ${number}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"><div class="d-autocomplete-dropdown" role="listbox"></div></div>`).join('')}</div>`;
    editor.list.appendChild(card);
    const type = card.querySelector('.d-experience-type');
    type.value = item.type || 'project';
    card.querySelector('.d-experience-title').value = item.title || '';
    card.querySelector('.d-experience-company').value = item.company_name || '';
    const description = card.querySelector('.d-experience-description');
    description.value = item.description || '';
    (item.skills || []).slice(0, 3).forEach((skill, index) => { card.querySelectorAll('.d-experience-skills input')[index].value = skill; });
    card.querySelectorAll('.d-experience-skills .d-autocomplete-wrap').forEach(wrap => {
      const input = wrap.querySelector('input');
      const dropdown = wrap.querySelector('.d-autocomplete-dropdown');
      let activeIndex = -1;
      const close = () => { dropdown.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); activeIndex = -1; };
      const render = () => {
        const query = input.value.trim().toLowerCase();
        const taken = new Set([...card.querySelectorAll('.d-experience-skills input')].filter(other => other !== input).map(other => other.value.trim().toLowerCase()));
        const matches = editor.skills.filter(skill => !taken.has(skill.toLowerCase()) && (!query || skill.toLowerCase().includes(query)));
        dropdown.replaceChildren();
        activeIndex = -1;
        if (!matches.length) {
          const empty = document.createElement('div');
          empty.className = 'd-autocomplete-empty';
          empty.textContent = 'No matches found';
          dropdown.appendChild(empty);
        } else matches.forEach(skill => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'd-autocomplete-option';
          option.setAttribute('role', 'option');
          option.textContent = skill;
          option.addEventListener('click', () => { input.value = skill; close(); });
          dropdown.appendChild(option);
        });
        dropdown.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
      };
      input.addEventListener('focus', render);
      input.addEventListener('input', render);
      input.addEventListener('keydown', event => {
        const options = [...dropdown.querySelectorAll('.d-autocomplete-option')];
        if (event.key === 'Escape') { close(); return; }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
          event.preventDefault();
          activeIndex = event.key === 'ArrowDown' ? Math.min(activeIndex + 1, options.length - 1) : Math.max(activeIndex - 1, 0);
          options.forEach((option, index) => option.classList.toggle('is-active', index === activeIndex));
          options[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && activeIndex >= 0) {
          event.preventDefault();
          options[activeIndex].click();
        }
      });
      input.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 0));
    });
    const syncType = () => { card.querySelector('.d-experience-company-wrap').hidden = type.value === 'project'; };
    const syncWords = () => { card.querySelector('.d-experience-word-count').textContent = `${this.wordCount(description.value)} / 150 words`; };
    type.addEventListener('change', syncType);
    description.addEventListener('input', syncWords);
    card.querySelector('.d-experience-remove').addEventListener('click', () => { card.remove(); this.sync(editor); });
    syncType();
    syncWords();
    this.sync(editor);
  },

  sync(editor) {
    [...editor.list.children].forEach((card, index) => { card.querySelector('.d-experience-number').textContent = index + 1; });
    editor.container.querySelector('.d-experience-add').disabled = editor.list.children.length >= 5;
  },

  wordCount(value) { return value.trim().split(/\s+/).filter(Boolean).length; },

  get(containerId) {
    const editor = this.editors.get(containerId);
    if (!editor) return [];
    if (editor.list.children.length > 5) throw new Error('Keep no more than 5 experiences.');
    return [...editor.list.children].map((card, index) => {
      const type = card.querySelector('.d-experience-type').value;
      const title = card.querySelector('.d-experience-title').value.trim();
      const company_name = card.querySelector('.d-experience-company').value.trim();
      const description = card.querySelector('.d-experience-description').value.trim();
      const skills = [...card.querySelectorAll('.d-experience-skills input')].map(input => input.value.trim()).filter(Boolean);
      const label = `Experience ${index + 1}`;
      if (!title) throw new Error(`${label} needs a title.`);
      if (type !== 'project' && !company_name) throw new Error(`${label} needs a company name.`);
      if (this.wordCount(description) < 10 || this.wordCount(description) > 150) throw new Error(`${label} needs a description of 10 to 150 words.`);
      if (skills.length < 1 || skills.length > 3 || new Set(skills.map(skill => skill.toLowerCase())).size !== skills.length) throw new Error(`${label} needs 1 to 3 different skills.`);
      return { type, title, ...(type === 'project' ? {} : { company_name }), description, skills };
    });
  }
};
