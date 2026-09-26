/** Private application records, keyed by opportunity ID and then applicant user ID. */
const store = require('./store');

const FILE = 'applications.json';

async function read() {
  return store.read(FILE);
}

async function removeOpportunity(opportunityId) {
  await store.atomicUpdate(FILE, applications => {
    delete applications[opportunityId];
    return applications;
  });
}

async function removeUser(userId) {
  await store.atomicUpdate(FILE, applications => {
    for (const [opportunityId, applicants] of Object.entries(applications)) {
      delete applicants[userId];
      if (!Object.keys(applicants).length) delete applications[opportunityId];
    }
    return applications;
  });
}

module.exports = { FILE, read, removeOpportunity, removeUser };
