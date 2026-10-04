/* LARPABLE — page-load beacon. One ping per page load; failures are silent. */
(function () {
  try {
    var body = JSON.stringify({ page: location.pathname || '/' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/activity/ping', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/activity/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        credentials: 'include',
        keepalive: true
      }).catch(function () {});
    }
  } catch (e) { /* never break the page */ }
})();
