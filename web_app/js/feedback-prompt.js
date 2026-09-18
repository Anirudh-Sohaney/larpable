const FeedbackPrompt = {
  prompt: null,

  async request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not save feedback.');
    return data;
  },

  async init() {
    try {
      const data = await this.request('/api/feedback/post-prompt', { cache: 'no-store' });
      if (!data.prompt) return;
      this.prompt = data.prompt;
      this.open();
    } catch (error) {
      console.error('Feedback prompt unavailable:', error);
    }
  },

  open() {
    const overlay = document.createElement('div');
    overlay.className = 'd-feedback-overlay';
    overlay.id = 'post-feedback-overlay';
    overlay.innerHTML = `
      <section class="d-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="post-feedback-title">
        <p class="d-feedback-eyebrow">A quick check-in</p>
        <h2 id="post-feedback-title">Did your post help?</h2>
        <p class="d-feedback-copy">Did “${Utils.escapeHtml(this.prompt.title)}” bring you benefits or the help you were looking for?</p>
        <form id="post-feedback-form">
          <fieldset class="d-feedback-choices">
            <legend>Your result</legend>
            <label><input type="radio" name="post-outcome" value="helped" required> Yes, it helped</label>
            <label><input type="radio" name="post-outcome" value="not_yet" required> Not yet</label>
          </fieldset>
          <fieldset class="d-feedback-stars">
            <legend>Rate your experience</legend>
            <div>${[1,2,3,4,5].map(n => `<label><input type="radio" name="post-rating" value="${n}" required><span aria-hidden="true">★</span><span class="d-sr-only">${n} star${n === 1 ? '' : 's'}</span></label>`).join('')}</div>
          </fieldset>
          <label class="d-label" for="post-feedback-text">Anything else? <span class="d-feedback-optional">Optional · 200 words max</span></label>
          <textarea class="d-textarea" id="post-feedback-text" rows="4" placeholder="Tell us what happened."></textarea>
          <div class="d-feedback-count"><span id="post-feedback-words">0</span> / 200 words</div>
          <p class="d-feedback-error" id="post-feedback-error" role="alert"></p>
          <div class="d-feedback-actions">
            <button class="d-btn-ghost" id="post-feedback-later" type="button">Come back later</button>
            <button class="d-btn" id="post-feedback-submit" type="submit">Submit feedback</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    const textarea = document.getElementById('post-feedback-text');
    textarea.addEventListener('input', () => this.updateWords(textarea));
    document.getElementById('post-feedback-form').addEventListener('submit', event => this.submit(event));
    document.getElementById('post-feedback-later').addEventListener('click', () => this.defer());
  },

  updateWords(textarea) {
    const count = this.wordCount(textarea.value);
    document.getElementById('post-feedback-words').textContent = count;
    textarea.setCustomValidity(count > 200 ? 'Keep your feedback to 200 words or fewer.' : '');
  },

  wordCount(value) {
    const text = String(value || '').trim();
    return text ? text.split(/\s+/).length : 0;
  },

  setBusy(busy) {
    document.getElementById('post-feedback-submit').disabled = busy;
    document.getElementById('post-feedback-later').disabled = busy;
  },

  showError(message) {
    document.getElementById('post-feedback-error').textContent = message;
  },

  close() {
    document.getElementById('post-feedback-overlay')?.remove();
  },

  async defer() {
    this.setBusy(true);
    this.showError('');
    try {
      await this.request(`/api/feedback/post-prompt/${encodeURIComponent(this.prompt.opportunity_id)}/defer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      this.close();
    } catch (error) {
      this.showError(error.message);
      this.setBusy(false);
    }
  },

  async submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const textarea = document.getElementById('post-feedback-text');
    this.updateWords(textarea);
    if (!form.reportValidity()) return;
    this.setBusy(true);
    this.showError('');
    try {
      await this.request('/api/feedback/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: this.prompt.opportunity_id,
          outcome: new FormData(form).get('post-outcome'),
          rating: Number(new FormData(form).get('post-rating')),
          text: textarea.value
        })
      });
      this.close();
    } catch (error) {
      this.showError(error.message);
      this.setBusy(false);
    }
  }
};
