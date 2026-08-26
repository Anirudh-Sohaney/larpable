/**
 * LARPABLE — Input Sanitization
 *
 * Strips HTML/script tags and trims whitespace from user-supplied strings.
 * Applied to all profile and opportunity fields before storage.
 */

/**
 * Strip HTML tags and dangerous characters from a string.
 * @param {*} value
 * @returns {string|*} sanitized value, or original if not a string
 */
function sanitize(value) {
  if (typeof value !== 'string') return value;
  // Remove HTML tags, scripts, event handlers
  return value
    .replace(/<[^>]*>/g, '')        // strip all HTML tags
    .replace(/javascript:/gi, '')    // strip javascript: protocol
    .replace(/on\w+\s*=/gi, '')      // strip on* event handlers
    .trim();
}

/**
 * Deep-sanitize an object: sanitize all string values recursively.
 * Arrays of strings are sanitized element-by-element.
 * @param {Object|Array|*} obj
 * @returns {Object|Array|*} new sanitized copy
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'string') return sanitize(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
}

module.exports = { sanitize, sanitizeObject };
