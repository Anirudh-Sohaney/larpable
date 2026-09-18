const FeedbackPage = {
  async request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not save feedback.');
    return data;
  },

  async init() {
    const content = document.getElementById('platform-feedback-content');
    try {
      const status = await this.request('/api/feedback/platform/status', { cache: 'no-store' });
      status.submitted ? this.renderThanks(status.feedback) : this.renderForm();
    } catch (error) {
      content.innerHTML = `<p class="d-feedback-error">${Utils.escapeHtml(error.message)}</p>`;
    }
  },

  renderThanks(feedback) {
    const labels = {
      found_help: 'Found help', found_opportunity_to_help: 'Found an opportunity to help',
      both: 'Found help and helped someone', neither_yet: 'Still looking'
    };
    const rating = Math.max(0, Math.min(5, Math.round(Number(feedback?.rating) || 0)));
    document.getElementById('platform-feedback-content').innerHTML = `
      <div class="d-feedback-thanks">
        <div class="d-feedback-thanks-icon">✓</div>
        <h2>Thank you for sharing.</h2>
        <p>${Utils.escapeHtml(labels[feedback?.outcome] || 'Your feedback was submitted')} · ${'★'.repeat(rating)}</p>
      </div>`;
  },

  renderForm() {
    const content = document.getElementById('platform-feedback-content');
    content.innerHTML = `
      <form id="platform-feedback-form">
        <fieldset class="d-feedback-choices">
          <legend>What have you found?</legend>
          <label><input type="radio" name="outcome" value="found_help" required> Help for something I needed</label>
          <label><input type="radio" name="outcome" value="found_opportunity_to_help" required> An opportunity to help someone</label>
          <label><input type="radio" name="outcome" value="both" required> Both</label>
          <label><input type="radio" name="outcome" value="neither_yet" required> Neither yet</label>
        </fieldset>
        <fieldset class="d-feedback-stars">
          <legend>Rate your experience</legend>
          <div>${[1,2,3,4,5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">★</span><span class="d-sr-only">${n} star${n === 1 ? '' : 's'}</span></label>`).join('')}</div>
        </fieldset>
        <label class="d-label" for="platform-feedback-text">Anything else? <span class="d-feedback-optional">Optional · 200 words max</span></label>
        <textarea class="d-textarea" id="platform-feedback-text" rows="6" placeholder="Tell us what worked or what could be better."></textarea>
        <div class="d-feedback-count"><span id="platform-feedback-words">0</span> / 200 words</div>
        <p class="d-feedback-error" id="platform-feedback-error" role="alert"></p>
        <button class="d-btn" id="platform-feedback-submit" type="submit">Submit feedback</button>
      </form>`;
    const textarea = document.getElementById('platform-feedback-text');
    textarea.addEventListener('input', () => this.updateWords(textarea));
    document.getElementById('platform-feedback-form').addEventListener('submit', event => this.submit(event));
  },

  wordCount(value) {
    const text = String(value || '').trim();
    return text ? text.split(/\s+/).length : 0;
  },

  updateWords(textarea) {
    const count = this.wordCount(textarea.value);
    document.getElementById('platform-feedback-words').textContent = count;
    textarea.setCustomValidity(count > 200 ? 'Keep your feedback to 200 words or fewer.' : '');
  },

  async submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const textarea = document.getElementById('platform-feedback-text');
    this.updateWords(textarea);
    if (!form.reportValidity()) return;
    const button = document.getElementById('platform-feedback-submit');
    const error = document.getElementById('platform-feedback-error');
    button.disabled = true;
    error.textContent = '';
    const fields = new FormData(form);
    try {
      await this.request('/api/feedback/platform', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: fields.get('outcome'), rating: Number(fields.get('rating')), text: textarea.value })
      });
      this.renderThanks({ outcome: fields.get('outcome'), rating: Number(fields.get('rating')) });
    } catch (requestError) {
      error.textContent = requestError.message;
      button.disabled = false;
    }
  }
};
