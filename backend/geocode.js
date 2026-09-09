/**
 * Geocoding utility using the Photon API (photon.komoot.io).
 *
 * - In-memory cache avoids duplicate lookups within a session
 * - Rate-limited: 200ms between calls to be fair to the public API
 * - Returns { lat, lon } or null
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';
const CACHE = new Map();
let lastCall = 0;
const MIN_INTERVAL_MS = 200;

/**
 * Normalize a location string for use as a cache key.
 * "Boston, Massachusetts, United States" → "boston, massachusetts, united states"
 */
function normalizeKey(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Geocode a location string → { lat, lon } or null.
 * Accepts a display string like "Boston, Massachusetts, United States"
 * or a city string like "Boston".
 */
async function geocode(location) {
  if (!location || location.toLowerCase() === 'remote') return null;

  const key = normalizeKey(location);
  if (CACHE.has(key)) return CACHE.get(key);

  // Rate limit
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();

  try {
    const url = `${PHOTON_URL}?q=${encodeURIComponent(location)}&limit=1&lang=en`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature?.geometry?.coordinates) return null;

    const [lon, lat] = feature.geometry.coordinates;
    const result = { lat, lon };
    CACHE.set(key, result);
    return result;
  } catch (e) {
    console.error('Geocode error:', e.message);
    return null;
  }
}

/**
 * Geocode using structured fields (city, state, country).
 * Builds a display string and geocodes it.
 */
async function geocodeStructured(city, state, country) {
  const parts = [city, state, country].filter(Boolean);
  if (!parts.length) return null;
  return geocode(parts.join(', '));
}

/**
 * Batch geocode an array of { id, location } objects.
 * Returns a Map of id → { lat, lon } (only successful lookups).
 * Respects rate limits with sequential calls.
 */
async function batchGeocode(items) {
  const results = new Map();
  for (const item of items) {
    if (!item.location || item.location.toLowerCase() === 'remote') continue;
    const coords = await geocode(item.location);
    if (coords) results.set(item.id, coords);
  }
  return results;
}

module.exports = { geocode, geocodeStructured, batchGeocode };
