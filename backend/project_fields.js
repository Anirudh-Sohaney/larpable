function validate(fields) {
  if (typeof fields.name !== 'string' || !fields.name.trim()) throw new Error('Project name is required');
  const words = typeof fields.elevator_pitch === 'string' ? fields.elevator_pitch.trim().split(/\s+/).length : 0;
  if (words < 2 || words > 30) throw new Error('Project pitch must contain 2–30 words');
  if (!Array.isArray(fields.tags) || !fields.tags.length || fields.tags.some(t=>typeof t !== 'string' || !t.trim())) throw new Error('Project requires at least one tag');
}

const TYPES = new Set(['nonprofit','project','company']);
module.exports={validate,TYPES};
