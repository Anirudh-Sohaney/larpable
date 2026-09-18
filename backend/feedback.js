const FEEDBACK_FILE = 'feedback.json';
const FEEDBACK_SCHEMA_VERSION = 1;
const PROMPT_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

function normalizeFeedbackData(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let records = source.records;

  // Adapt an early flat collection, if one is ever encountered, without
  // discarding it when the versioned shape is written back.
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    records = {};
    for (const [id, record] of Object.entries(source)) {
      if (record && typeof record === 'object' && ['post', 'platform'].includes(record.kind)) {
        records[id] = record;
      }
    }
  }

  return {
    ...source,
    schema_version: FEEDBACK_SCHEMA_VERSION,
    records,
    post_prompts: source.post_prompts && typeof source.post_prompts === 'object' && !Array.isArray(source.post_prompts)
      ? source.post_prompts
      : {}
  };
}

function countWords(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/).length : 0;
}

function userPromptState(data, userId, opportunityId) {
  return data.post_prompts?.[userId]?.[opportunityId] || null;
}

function hasPostFeedback(data, userId, opportunityId) {
  return Object.values(data.records || {}).some(record =>
    record?.kind === 'post' &&
    record.user_id === userId &&
    record.opportunity_id === opportunityId
  );
}

function hasPlatformFeedback(data, userId) {
  return Object.values(data.records || {}).some(record =>
    record?.kind === 'platform' && record.user_id === userId
  );
}

function userIdentity(user) {
  const fields = user?.encrypted_fields || {};
  const first = fields.first_name || fields.firstName || '';
  const last = fields.last_name || fields.lastName || '';
  return {
    username: fields.username || '',
    display_name: [first, last].filter(Boolean).join(' ') || fields.username || user?.id || 'Unknown user'
  };
}

async function removeUserFeedback(store, userId) {
  await store.atomicUpdate(FEEDBACK_FILE, raw => {
    const data = normalizeFeedbackData(raw);
    for (const [id, record] of Object.entries(data.records)) {
      if (record?.user_id === userId) delete data.records[id];
    }
    delete data.post_prompts[userId];
    return data;
  });
}

module.exports = {
  FEEDBACK_FILE,
  PROMPT_DELAY_MS,
  normalizeFeedbackData,
  countWords,
  userPromptState,
  hasPostFeedback,
  hasPlatformFeedback,
  userIdentity,
  removeUserFeedback
};
