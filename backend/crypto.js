/**
 * LARPABLE — Cryptographic Utilities
 * 
 * SHA-256 hashing (irreversible) for passwords, usernames, lookups
 * AES-256-GCM encryption (reversible) for displayable data
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

// ── Load encryption key from env ──────────────────────────────
function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters in .env');
  }
  return Buffer.from(keyHex, 'hex');
}

// ── SHA-256 Hashing (irreversible) ────────────────────────────

/**
 * Generate a random salt
 * @returns {string} base64-encoded salt
 */
function generateSalt() {
  return crypto.randomBytes(SALT_BYTES).toString('base64');
}

/**
 * Hash a value with SHA-256 + salt (for passwords)
 * @param {string} value - plaintext to hash
 * @param {string} salt - base64-encoded salt (optional, generates if not provided)
 * @returns {{ hash: string, salt: string }} hex hash + base64 salt
 */
function sha256(value, salt) {
  if (!salt) salt = generateSalt();
  const hash = crypto
    .createHash('sha256')
    .update(salt + value)
    .digest('hex');
  return { hash, salt };
}

/**
 * Deterministic hash — no salt, for username lookups
 * @param {string} value - plaintext to hash
 * @returns {string} hex hash
 */
function sha256Lookup(value) {
  const pepper = 'larpable_username_v1';
  return crypto
    .createHash('sha256')
    .update(pepper + value)
    .digest('hex');
}

/**
 * Verify a value against a stored hash
 * @param {string} value - plaintext to verify
 * @param {string} storedHash - hex hash to compare against
 * @param {string} salt - base64-encoded salt
 * @returns {boolean}
 */
function verifyHash(value, storedHash, salt) {
  const { hash } = sha256(value, salt);
  return hash === storedHash;
}

/**
 * Generate a session token (random 32 bytes, returned as hex)
 * @returns {string} hex token (64 chars)
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a session token for storage
 * @param {string} token - hex token
 * @returns {string} sha256 hex hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── AES-256-GCM Encryption (reversible) ───────────────────────

/**
 * Encrypt a plaintext string
 * @param {string} plaintext - data to encrypt
 * @returns {string} encrypted string in format "base64(iv):base64(tag):base64(ciphertext)"
 */
function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encrypted - format "enc:base64(iv):base64(tag):base64(ciphertext)"
 * @returns {string} decrypted plaintext
 */
function decrypt(encrypted) {
  if (!encrypted || !encrypted.startsWith('enc:')) {
    throw new Error('Invalid encrypted format: must start with "enc:"');
  }
  
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Check if a value is encrypted
 * @param {*} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('enc:');
}

/**
 * Deep-encrypt an object: encrypt all string values that aren't already encrypted
 * @param {Object} obj
 * @returns {Object} new object with encrypted values
 */
function encryptObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(encryptObject);
  if (typeof obj === 'string') return isEncrypted(obj) ? obj : encrypt(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  
  const encrypted = {};
  for (const [key, value] of Object.entries(obj)) {
    encrypted[key] = encryptObject(value);
  }
  return encrypted;
}

/**
 * Deep-decrypt an object: decrypt all encrypted string values
 * @param {Object} obj
 * @returns {Object} new object with decrypted values
 */
function decryptObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(decryptObject);
  if (typeof obj === 'string') return isEncrypted(obj) ? decrypt(obj) : obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  
  const decrypted = {};
  for (const [key, value] of Object.entries(obj)) {
    decrypted[key] = decryptObject(value);
  }
  return decrypted;
}

module.exports = {
  generateSalt,
  sha256,
  sha256Lookup,
  verifyHash,
  generateToken,
  hashToken,
  encrypt,
  decrypt,
  isEncrypted,
  encryptObject,
  decryptObject
};
