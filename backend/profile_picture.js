/** Bounded, encrypted profile images; letter avatars need no migration or stored files. */
const COLORS = ['#171717', '#142d4e', '#194532', '#593778', '#62666d'];
const MAX_BYTES = 12 * 1024 * 1024;
let active = 0;
async function normalize(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES / 3) * 4 + 100 ||
      !/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
    throw Object.assign(new Error('Choose a JPEG, PNG, WebP, GIF, or AVIF image up to 12 MB.'), {status:400});
  }
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) throw Object.assign(new Error('Image must be 12 MB or smaller.'), {status:400});
  if(active >= 2) throw Object.assign(new Error('Picture processing is busy. Please try again shortly.'), {status:503});
  active++;
  try {
    const output = await require('sharp')(bytes, {limitInputPixels:40000000, animated:false})
      .rotate().resize(256,256,{fit:'cover'}).webp({quality:80}).toBuffer();
    return output.toString('base64');
  } catch {
    throw Object.assign(new Error('This image could not be opened. Choose another image (up to 40 megapixels).'), {status:400});
  } finally { active--; }
}
function fallback(username) {
  const name = String(username || '?');
  let hash = 0;
  for (const letter of name) hash = (hash * 31 + letter.codePointAt(0)) >>> 0;
  const letter = Array.from(name)[0].toUpperCase().replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><circle cx="128" cy="128" r="128" fill="${COLORS[hash % COLORS.length]}"/><text x="128" y="132" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial,sans-serif" font-size="120">${letter}</text></svg>`;
}
module.exports = {normalize,fallback,MAX_BYTES};
