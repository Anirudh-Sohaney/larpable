/**
 * LARPABLE — Authentication Module
 * 
 * Handles signup, login, logout, and session management.
 * Sessions persist via httpOnly cookies.
 * Passwords and usernames are SHA-256 hashed.
 * Profile data is AES-256-GCM encrypted.
 * 
 * All store operations are async (non-blocking I/O).
 */

const { sha256, sha256Lookup, verifyHash, generateToken, hashToken, encryptObject, decryptObject } = require('./crypto');
const { sanitizeObject } = require('./sanitize');
const store = require('./store');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSIONS_FILE = 'sessions.json';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Generate a unique user ID from username hash
 */
function generateUserId(usernameHash) {
  return 'usr_' + usernameHash.substring(0, 12);
}

/**
 * Generate a unique opportunity ID from title + timestamp
 */
function generateOpportunityId(title, timestamp) {
  const data = title + timestamp;
  const { hash } = sha256(data);
  return 'opp_' + hash.substring(0, 12);
}

// ── Signup ───────────────────────────────────────────────────

/**
 * Create a new user account
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.type - "student" | "nonprofit" | "business"
 * @param {Object} params.profile - type-specific profile fields
 * @returns {Promise<{ userId: string, token: string }>}
 * @throws {Error} if username already taken
 */
async function signup({ username, password, type, profile }) {
  // Hash username (deterministic lookup hash, no salt needed)
  const usernameHash = sha256Lookup(username);
  
  // Check if username already exists
  const existing = await store.findUserByUsernameHash(usernameHash);
  if (existing) {
    throw new Error('Username already taken');
  }
  
  // Hash password
  const { hash: passwordHash, salt: passwordSalt } = sha256(password);
  
  // Generate user ID
  const userId = generateUserId(usernameHash);
  
  // Sanitize all profile fields (prevent XSS)
  const cleanProfile = sanitizeObject(profile);

  // Include username in encrypted_fields so it can be displayed on profile
  cleanProfile.username = username;

  // Encrypt profile fields
  const encryptedProfile = encryptObject(cleanProfile);
  
  // Build user record
  const userRecord = {
    username_hash: usernameHash,
    password_hash: passwordHash,
    password_salt: passwordSalt,
    type: type,
    created_at: new Date().toISOString(),
    encrypted_fields: encryptedProfile
  };
  
  // Save user
  await store.saveUser(userId, userRecord);
  
  // Create session
  const token = await createSession(userId);
  
  return { userId, token };
}

// ── Login ────────────────────────────────────────────────────

/**
 * Authenticate a user
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ userId: string, token: string, user: Object }>}
 * @throws {Error} if credentials invalid
 */
async function login(username, password) {
  // Hash username to find user (deterministic lookup)
  const usernameHash = sha256Lookup(username);
  
  const found = await store.findUserByUsernameHash(usernameHash);
  if (!found) {
    throw new Error('Invalid username or password');
  }
  
  // Verify password
  const valid = verifyHash(password, found.record.password_hash, found.record.password_salt);
  if (!valid) {
    throw new Error('Invalid username or password');
  }
  
  // Create session
  const token = await createSession(found.id);
  
  // Get decrypted user
  const user = await store.getUser(found.id);
  user.id = found.id;
  
  return { userId: found.id, token, user };
}

// ── Sessions ─────────────────────────────────────────────────

/**
 * Create a new session for a user
 * @param {string} userId
 * @returns {Promise<string>} plaintext session token (to set as cookie)
 */
async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  
  // Atomic read-modify-write prevents race conditions
  // (two concurrent logins won't overwrite each other's sessions)
  await store.atomicUpdate(SESSIONS_FILE, (sessions) => {
    // Remove any existing sessions for this user
    for (const [hash, session] of Object.entries(sessions)) {
      if (session.user_id === userId) {
        delete sessions[hash];
      }
    }
    // Create new session
    sessions[tokenHash] = {
      user_id: userId,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    };
    return sessions;
  });
  
  return token;
}

/**
 * Validate a session token
 * @param {string} token - plaintext token from cookie
 * @returns {Promise<{ userId: string }|null>}
 */
async function validateSession(token) {
  if (!token) return null;
  
  const tokenHash = hashToken(token);
  const sessions = await store.read(SESSIONS_FILE);
  const session = sessions[tokenHash];
  
  if (!session) return null;
  
  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    // Atomic cleanup of expired session
    await store.atomicUpdate(SESSIONS_FILE, (s) => {
      delete s[tokenHash];
      return s;
    });
    return null;
  }
  
  return { userId: session.user_id };
}

/**
 * Destroy a session
 * @param {string} token - plaintext token from cookie
 */
async function destroySession(token) {
  if (!token) return;
  
  const tokenHash = hashToken(token);
  await store.atomicUpdate(SESSIONS_FILE, (sessions) => {
    delete sessions[tokenHash];
    return sessions;
  });
}

/**
 * Get a full user object from a session token
 * @param {string} token
 * @returns {Promise<Object|null>} decrypted user with id field
 */
async function getUserFromToken(token) {
  const session = await validateSession(token);
  if (!session) return null;
  
  const user = await store.getUser(session.userId);
  if (!user) return null;
  
  user.id = session.userId;
  return user;
}

module.exports = {
  signup,
  login,
  createSession,
  validateSession,
  destroySession,
  getUserFromToken,
  generateUserId,
  generateOpportunityId
};
