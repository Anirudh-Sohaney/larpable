/**
 * LARPABLE — Shared Resend Mailer
 *
 * Single sending path for all non-verification emails (re-engagement,
 * application notifications). Same provider + retry discipline as the
 * signup verification flow in backend/routes/verify.routes.js.
 *
 * Uses the already-verified sending domain so no new DNS is required.
 * Set NOTIFY_FROM_EMAIL to override; defaults to the verification sender.
 */

const SEND_TIMEOUT_MS = 10000;
const SEND_MAX_ATTEMPTS = 3;
const SEND_RETRY_BASE_MS = 800;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_URL = 'https://api.resend.com/emails';
const NOTIFY_FROM_EMAIL =
  process.env.NOTIFY_FROM_EMAIL ||
  process.env.VERIFY_FROM_EMAIL ||
  'verification@larpable.me';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isRetryable(err) {
  const status = err && err.resendStatus;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  if (!status) return true; // network error / timeout / fetch failure
  return false;
}

/**
 * Send one email via Resend. Retries transient failures.
 * @param {{ to: string, subject: string, html: string, text?: string }} params
 * @returns {Promise<{ delivered: boolean, id?: string, reason?: string }>}
 * @throws on permanent failure or exhausted retries (caller decides whether
 * the request must fail — notification callers must not fail user actions).
 */
async function sendEmail({ to, subject, html, text }) {
  const toEmail = String(to || '').trim();
  if (!toEmail || !/.+@.+\..+/.test(toEmail)) {
    throw new Error('Refusing to send: invalid recipient address');
  }
  if (!RESEND_API_KEY) {
    if (IS_PRODUCTION) throw new Error('Email provider is not configured');
    console.log('[mailer] development send skipped to=' + toEmail);
    return { delivered: false, reason: 'no-provider' };
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(RESEND_API_URL, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'LARPABLE <' + NOTIFY_FROM_EMAIL + '>',
            to: toEmail,
            subject,
            html,
            ...(text ? { text } : {})
          }),
          signal: controller.signal
        });
      } catch (e) {
        throw new Error('Resend request failed: ' + (e.name === 'AbortError' ? 'timeout' : e.message));
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 200); } catch {}
        const err = new Error('Resend HTTP ' + res.status + (detail ? ' ' + detail : ''));
        err.resendStatus = res.status;
        throw err;
      }
      let id = '';
      try { id = (await res.json()).id || ''; } catch {}
      console.log('[mailer] accepted' + (id ? ' id=' + id : '') + ' to=' + toEmail + ' subject=' + subject);
      return { delivered: true, id };
    } catch (err) {
      lastErr = err;
      console.error(`[mailer] attempt ${attempt}/${SEND_MAX_ATTEMPTS} to=${toEmail}:`, err.message);
      if (attempt >= SEND_MAX_ATTEMPTS || !isRetryable(err)) throw err;
      await sleep(SEND_RETRY_BASE_MS * attempt);
    }
  }
  throw lastErr;
}

module.exports = { sendEmail, NOTIFY_FROM_EMAIL };
