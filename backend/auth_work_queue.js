/**
 * Bounded CPU-work queue for password hashing and verification.
 * Keep a core available for the HTTP event loop and filesystem work; queued
 * callers wait, while overload is rejected instead of growing without bound.
 */
const MAX_CONCURRENT_AUTH_WORK = 3;
const MAX_PENDING_AUTH_WORK = 250;

const pending = [];
let active = 0;

class AuthWorkQueueFullError extends Error {
  constructor() {
    super('Authentication is busy. Please try again shortly.');
    this.name = 'AuthWorkQueueFullError';
    this.code = 'AUTH_WORK_QUEUE_FULL';
  }
}

class AuthWorkCancelledError extends Error {
  constructor() {
    super('The authentication request was cancelled.');
    this.name = 'AuthWorkCancelledError';
    this.code = 'AUTH_WORK_CANCELLED';
  }
}

function start(job) {
  job.signal?.removeEventListener('abort', job.onAbort);
  if (job.signal?.aborted) {
    job.reject(new AuthWorkCancelledError());
    return;
  }
  active++;
  Promise.resolve()
    .then(job.work)
    .then(job.resolve, job.reject)
    .then(finish, finish);
}

function finish() {
  active--;
  const next = pending.shift();
  if (next) start(next);
}

function runAuthWork(work, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AuthWorkCancelledError());
    const job = { work, resolve, reject, signal };
    if (active < MAX_CONCURRENT_AUTH_WORK) return start(job);
    if (pending.length >= MAX_PENDING_AUTH_WORK) return reject(new AuthWorkQueueFullError());
    job.onAbort = () => {
      const index = pending.indexOf(job);
      if (index === -1) return;
      pending.splice(index, 1);
      reject(new AuthWorkCancelledError());
    };
    signal?.addEventListener('abort', job.onAbort, { once: true });
    pending.push(job);
  });
}

function getAuthWorkQueueStats() {
  return { active, pending: pending.length, concurrency: MAX_CONCURRENT_AUTH_WORK, maxPending: MAX_PENDING_AUTH_WORK };
}

module.exports = { runAuthWork, AuthWorkQueueFullError, AuthWorkCancelledError, getAuthWorkQueueStats };
