/** Crawlable opportunity pages: descriptive canonical URLs, server-rendered content and JobPosting markup.
 * Contact links, applying and commenting stay behind login; the client script still hydrates the full page.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const store=require('./store');

const SITE_URL=(process.env.SITE_URL || 'https://larpable.me').replace(/\/+$/,'');
const TEMPLATE=path.join(__dirname,'..','web_app','opportunity.html');
const SEGMENTS={company:'internship',nonprofit:'volunteering',project:'job'};
const LABELS={company:'Internship',nonprofit:'Volunteering',project:'Job'};
const ID=/(opp_[a-f0-9]+)$/;

const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const paragraphs=(...texts)=>texts.filter(Boolean).map(t=>'<p>'+esc(t).replace(/\n/g,'<br>')+'</p>').join('');
const words=(text,max)=>String(text || '').normalize('NFKD').replace(/[\u0300-\u036f'’]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0,max);
// Empty for remote-only posts; otherwise "City, Region, Country" as entered.
const place=fields=>{const location=String(fields.location || '').trim();return /^remote$/i.test(location) ? '' : location;};

function oppPath(opp) {
  const fields=opp.encrypted_fields || {},where=place(fields).split(',').slice(0,2).join(' ');
  const slug=[...words(opp.project?.fields?.name,6),...words(fields.looking_for,6),...(where ? words(where,4) : ['remote'])].join('-');
  return `/${SEGMENTS[opp.type] || 'job'}/${slug}-${opp.id}`;
}

// Keyword checks over what the poster wrote; post type supplies the default.
function employmentType(opp) {
  const fields=opp.encrypted_fields || {},text=`${fields.looking_for || ''} ${fields.description || ''}`.toLowerCase();
  return /\bintern(s|ships?)?\b/.test(text) ? 'INTERN' : /\bvolunteer/.test(text) ? 'VOLUNTEER' : /\bpart[\s-]?time\b/.test(text) ? 'PART_TIME' : opp.type==='nonprofit' ? 'VOLUNTEER' : 'FULL_TIME';
}

// Google needs a country for every posting: the post's own, else the poster's profile country.
async function jobPosting(opp) {
  const fields=opp.encrypted_fields || {},where=place(fields);
  const [addressLocality,addressRegion,postCountry]=where.split(',').map(part=>part.trim());
  // ponytail: admin posts and the rare profile without a country fall back to the platform's home country.
  const country=postCountry || (await store.getUser(opp.created_by))?.encrypted_fields?.country || 'United States';
  return {
    '@context':'https://schema.org','@type':'JobPosting',
    title:fields.looking_for || opp.project?.fields?.name,
    // Google requires TELECOMMUTE postings to state they are fully remote.
    description:paragraphs(fields.description,fields.details)+(where ? '' : '<p>100% remote.</p>'),
    datePosted:opp.created_at,
    employmentType:employmentType(opp),
    hiringOrganization:{'@type':'Organization',name:opp.project?.fields?.name || 'LARPABLE.'},
    identifier:{'@type':'PropertyValue',name:'LARPABLE.',value:opp.id},
    directApply:false,
    url:SITE_URL+oppPath(opp),
    ...(where
      ? {jobLocation:{'@type':'Place',address:{'@type':'PostalAddress',addressLocality,addressRegion,addressCountry:country}}}
      : {jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{'@type':'Country',name:country}})
  };
}

function body(opp,posting) {
  const fields=opp.encrypted_fields || {},project=opp.project?.fields || {};
  const section=(label,html)=>html ? `<section class="d-detail-story"><div class="d-detail-section-heading"><span class="d-detail-eyebrow">${label}</span><span class="d-detail-rule"></span></div>${html}</section>` : '';
  const fact=(label,value)=>`<div class="d-detail-fact"><div class="d-detail-info-label">${label}</div><div class="d-detail-info-value">${esc(value)}</div></div>`;
  const locked=(text,button)=>`<div class="d-detail-contact d-detail-contact--locked"><h2>${text}</h2><a href="/login" class="d-btn d-btn-accent d-detail-locked-btn">${button}</a></div>`;
  return `<section class="d-detail-header"><div class="d-detail-kicker"><span class="d-detail-type d-badge d-badge--${esc(opp.type)}">${LABELS[opp.type] || 'Opportunity'}</span><span class="d-detail-dot">·</span><span>${esc(project.field || 'Student-led')}</span></div><h1 class="d-detail-title">${esc(project.name)}</h1></section>
${project.elevator_pitch ? `<section class="d-detail-story"><p class="d-detail-desc">${esc(project.elevator_pitch)}</p></section>` : ''}
${section('About this opportunity',`<p class="d-detail-desc">${esc(fields.description || 'No description provided.')}</p>`)}
${fields.looking_for ? `<section class="d-detail-looking-for"><div class="d-detail-looking-for-label">◉ &nbsp;Looking for</div><div class="d-detail-looking-for-value">${esc(fields.looking_for)}</div></section>` : ''}
${section('Skills needed',(fields.skills || []).map(skill=>`<span class="d-chip">${esc(skill)}</span>`).join(''))}
${section('Additional details',fields.details && `<p class="d-detail-desc">${esc(fields.details)}</p>`)}
<section class="d-detail-story"><div class="d-detail-facts">${fact('Location',place(fields) || 'Remote')}${fact('Posted',String(opp.created_at || '').slice(0,10))}${fact('Type',posting.employmentType.replace('_',' ').toLowerCase())}</div></section>
<section class="d-detail-story">${locked('Contact / sign-up','Log in to view contact details')}</section>
<section class="d-detail-story">${locked('Apply or join the conversation','Log in to apply and comment')}</section>`;
}

async function render(opp) {
  const [template,posting]=await Promise.all([fs.readFile(TEMPLATE,'utf8'),jobPosting(opp)]),fields=opp.encrypted_fields || {};
  const title=`${fields.looking_for || 'Opportunity'} — ${opp.project?.fields?.name || ''} | ${LABELS[opp.type] || 'Opportunity'} | LARPABLE.`;
  const summary=String(fields.description || '').replace(/\s+/g,' ').slice(0,160);
  const head=opp.flagged ? '<title>LARPABLE. — Opportunity</title><meta name="robots" content="noindex">' : `<title>${esc(title)}</title>
  <meta name="description" content="${esc(summary)}"><link rel="canonical" href="${esc(posting.url)}">
  <meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(summary)}"><meta property="og:url" content="${esc(posting.url)}">
  <script type="application/ld+json">${JSON.stringify(posting).replace(/</g,'\\u003c')}</script>`;
  const detail=`<div id="detail" data-id="${esc(opp.id)}">${opp.flagged ? '<div class="d-empty">Loading post...</div>' : body(opp,posting)}</div>`;
  return template.replace('<title>LARPABLE. — Opportunity</title>',()=>head).replace('<div id="detail"><div class="d-empty">Loading post...</div></div>',()=>detail);
}

// GET /:segment/:slug — serve the canonical page, redirecting stale slugs. Held posts stay unindexed for their author.
async function page(req,res,next) {
  try {
    const id=req.params.slug.match(ID)?.[1],opp=id && await store.getOpportunity(id);
    if (!opp) return next();
    const canonical=oppPath(opp);
    if (req.path!==canonical) return res.redirect(301,canonical+req.originalUrl.slice(req.path.length));
    res.type('html').send(await render(opp));
  } catch (error) { next(error); }
}

// GET /opportunity?id= — permanent redirect for old links; the feed's embedded pane keeps the legacy URL.
async function legacy(req,res,next) {
  try {
    if (req.query.embed==='1' || typeof req.query.id!=='string') return next();
    const opp=await store.getOpportunity(req.query.id);
    opp ? res.redirect(301,oppPath(opp)) : next();
  } catch (error) { next(error); }
}

module.exports={oppPath,employmentType,jobPosting,render,page,legacy};
