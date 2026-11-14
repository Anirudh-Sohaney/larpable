/* Google proves identity; Larpable continues to own profiles and sessions. */
(async () => {
  const host = document.getElementById('google-button');
  if (!host) return;
  const error = document.getElementById('google-error');
  function fail(message) { error.textContent = message; error.hidden = false; }
  try {
    const response = await fetch('/api/auth/google/config');
    const config = await response.json();
    if (!response.ok) throw new Error(config.error);
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in. Please try again.'));
      document.head.append(script);
    });
    google.accounts.id.initialize({
      client_id: config.clientId, nonce: config.nonce, auto_select: false,
      callback: async ({ credential }) => {
        async function finish(sendCode = false) {
          error.hidden = true;
          try {
            const response = await fetch('/api/auth/google', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential, sendCode })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (data.verifyEmail) {
              host.replaceChildren();
              const form = document.createElement('div');
              const label = document.createElement('p');
              label.textContent = 'Verify access to ' + data.verifyEmail + ' to continue.';
              const input = document.createElement('input');
              input.className = 'd-input'; input.placeholder = '6-digit email code';
              input.setAttribute('aria-label', 'Email verification code');
              input.inputMode = 'numeric'; input.autocomplete = 'one-time-code'; input.maxLength = 6;
              const send = document.createElement('button');
              send.type = 'button'; send.className = 'd-btn'; send.textContent = 'Send code';
              send.onclick = async () => { send.disabled = true; try { await finish(true); } finally { send.disabled = false; } };
              const verify = document.createElement('button');
              verify.className = 'd-btn d-btn-accent'; verify.textContent = 'Verify and continue';
              form.append(label, input, send, verify); host.append(form);
              verify.type = 'button';
              verify.onclick = async event => {
                event.preventDefault(); verify.disabled = true;
                try {
                  const result = await fetch('/api/verify/code', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: data.verifyEmail, code: input.value })
                  });
                  const checked = await result.json();
                  if (!result.ok) throw new Error(checked.error);
                  await finish();
                } catch (e) { fail(e.message); }
                finally { verify.disabled = false; }
              };
              return;
            }
            if (data.login) { location.href = '/feed'; return; }
            if (typeof continueGoogleSignup === 'function') continueGoogleSignup(data);
            else {
              sessionStorage.setItem('larpable_google_signup', JSON.stringify(data));
              location.href = '/signup';
            }
          } catch (e) { fail(e.message); }
        }
        await finish();
      }
    });
    host.replaceChildren();
    google.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 300 });
  } catch (e) { fail(e.message); }
})();
