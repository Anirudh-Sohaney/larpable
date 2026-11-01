// Project-first post editor. Project identity is never submitted as post content.
const projectType=document.getElementById('new-project-type');
const projectField=document.getElementById('new-project-field');
function showProjectField(){
 const needed=projectType.value!=='project';
 document.getElementById('new-project-field-row').hidden=!needed;
 projectField.disabled=!needed;projectField.required=needed;
}
projectType.addEventListener('change',showProjectField);showProjectField();
const projectFieldsReady=fetch('/api/match/entities').then(r=>{if(!r.ok)throw Error('Could not load project fields');return r.json();}).then(data=>{
 for(const value of data.fields || data.industries || []){const option=document.createElement('option');option.value=value;option.textContent=value;projectField.append(option);}
}).catch(error=>{projectError.textContent=error.message;});
const projectSelect=document.getElementById('parent-project');
const projectPanel=document.getElementById('new-project');
const postForm=document.getElementById('post-form');
const projectError=document.getElementById('project-error');
const projectSummary=document.getElementById('project-summary');
let ownedProjects=[];
let currentDraftId=null;
let suppressAutoSave=true;
let draftTimer;
let draftSaving=Promise.resolve();
let loadedSkills=[];
const editorParams=new URLSearchParams(location.search);
const editId=editorParams.get('edit');
const editProjectId=editorParams.get('edit_project');
const opportunityToggle=document.getElementById('opportunity-toggle');
const draftIds={post:null,opportunity:null};
let mediaSelection=null;
let mediaChoosing=Promise.resolve(true);
let mediaChoiceVersion=0;
const postKind=()=>opportunityToggle.checked ? 'opportunity' : 'post';
function updatePostKind() {
  const opportunity=opportunityToggle.checked;
  for(const [id,enabled] of [['opportunity-fields',opportunity],['regular-fields',!opportunity]]){
    const fieldset=document.getElementById(id);fieldset.hidden=!enabled;fieldset.disabled=!enabled;
  }
  document.getElementById('submit-btn').textContent=editId ? 'Save changes' : opportunity ? 'Post opportunity' : 'Post';
}
opportunityToggle.addEventListener('change',()=>{
  currentDraftId=draftIds[postKind()];updatePostKind();scheduleDraftSave();
});
function updatePostCounts() {
  const title=document.getElementById('post-title').value;
  const count=document.getElementById('post-title-count');
  count.textContent=`${countWords(title)} / 10 words · ${title.length} / 130 characters`;
  count.classList.toggle('over-limit',countWords(title)>10);
  document.getElementById('post-content-count').textContent=document.getElementById('post-content').value.length+' / 300';
}
for(const id of ['post-title','post-content'])document.getElementById(id).addEventListener('input',updatePostCounts);
const mediaInput=document.getElementById('post-media');
const mediaUpload=document.getElementById('media-upload');
function mediaStatus(message) {
  const status=document.getElementById('media-upload-status');status.textContent=message;status.hidden=!message;
}
function mediaError(message) {
  const error=document.getElementById('media-upload-error');error.textContent=message;error.hidden=!message;
}
function showMedia(selection) {
  const preview=document.getElementById('post-media-preview');preview.replaceChildren();
  preview.hidden=!selection;
  document.getElementById('choose-post-media').hidden=!!selection;
  document.getElementById('post-media-toolbar').hidden=!selection;
  if(!selection)return;
  const video=selection.file ? selection.video : selection.asset.kind==='video';
  const element=document.createElement(video ? 'video' : 'img');
  if(video){element.controls=true;element.preload='metadata';}else element.alt='Selected post image';
  element.className='d-post-media';element.src=selection.url || selection.asset.url;preview.appendChild(element);
  const size=selection.file?.size ?? selection.asset.size;
  const sizeLabel=size<1024*1024 ? Math.max(1,Math.round(size/1024))+' KB' : (size/(1024*1024)).toFixed(1)+' MB';
  document.getElementById('post-media-name').textContent=selection.file?.name || (video ? 'Attached video' : 'Attached image');
  document.getElementById('post-media-detail').textContent=[video ? 'Video' : 'Image',sizeLabel,(selection.duration || selection.asset?.duration) ? Math.round(selection.duration || selection.asset.duration)+' sec' : ''].filter(Boolean).join(' · ');
}
function replaceMedia(selection) {
  if(mediaSelection?.url)URL.revokeObjectURL(mediaSelection.url);
  mediaSelection=selection;showMedia(selection);
}
for(const id of ['choose-post-media','replace-post-media'])document.getElementById(id).addEventListener('click',()=>mediaInput.click());
function chooseMedia(files) {
  if(!files.length)return;
  const version=++mediaChoiceVersion;
  mediaError('');mediaStatus('');
  mediaChoosing=(async()=>{
    if(files.length!==1)throw new Error('Choose one image or video at a time.');
    const file=files[0];
    if(!file.size || file.size>64*1024*1024)throw new Error('Choose a file up to 64 MB.');
    if(!['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/quicktime','video/webm'].includes(file.type) && !/\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i.test(file.name))throw new Error('Choose a PNG, JPEG, GIF, WebP, MP4, MOV or WebM file.');
    const selection={file,video:file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name),url:URL.createObjectURL(file),uploads:new Map()};
    try{
      mediaStatus(selection.video ? 'Checking video…' : 'Checking image…');
      selection.ready=new Promise((resolve,reject)=>{
        const element=document.createElement(selection.video ? 'video' : 'img');
        const finish=error=>{if(selection.video){element.removeAttribute('src');element.load();}error ? reject(error) : resolve();};
        if(selection.video){element.preload='metadata';element.onloadedmetadata=()=>{selection.duration=element.duration;finish(!Number.isFinite(element.duration) || element.duration>60 ? new Error('Videos must be at most 60 seconds.') : null);};}
        else element.onload=()=>finish();
        element.onerror=()=>finish(new Error('This file could not be opened. Try another file.'));
        element.src=selection.url;
      });
      await selection.ready;
      if(version!==mediaChoiceVersion){URL.revokeObjectURL(selection.url);return true;}
      replaceMedia(selection);mediaStatus('Ready to attach');scheduleDraftSave();return true;
    }catch(error){URL.revokeObjectURL(selection.url);throw error;}
  })().catch(error=>{if(version===mediaChoiceVersion){mediaStatus('');mediaError(error.message);}return false;});
}
mediaInput.addEventListener('change',()=>{chooseMedia([...mediaInput.files]);mediaInput.value='';});
let mediaDragDepth=0;
mediaUpload.addEventListener('dragenter',event=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();mediaDragDepth++;mediaUpload.classList.add('is-dragging');});
mediaUpload.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
mediaUpload.addEventListener('dragleave',()=>{if(--mediaDragDepth<=0){mediaDragDepth=0;mediaUpload.classList.remove('is-dragging');}});
mediaUpload.addEventListener('drop',event=>{
  event.preventDefault();mediaDragDepth=0;mediaUpload.classList.remove('is-dragging');
  if(!document.getElementById('regular-fields').disabled)chooseMedia([...event.dataTransfer.files]);
});
document.getElementById('remove-post-media').addEventListener('click',()=>{
  mediaChoiceVersion++;mediaChoosing=Promise.resolve(true);replaceMedia(null);mediaInput.value='';mediaStatus('');mediaError('');scheduleDraftSave();
});
async function selectedMediaId(selection,projectId) {
  if(!selection)return null;
  if(selection.asset){if(selection.projectId!==projectId)throw new Error('Choose media again for this project');return selection.asset.id;}
  await selection.ready;
  if(!selection.uploads.has(projectId)){
    if(mediaSelection===selection)mediaStatus('Uploading…');
    const upload=editorRequest('/api/media?project_id='+encodeURIComponent(projectId),{method:'POST',headers:{'Content-Type':selection.file.type || 'application/octet-stream'},body:selection.file})
      .then(result=>{if(mediaSelection===selection)mediaStatus('Attached');return result.media.id;}).catch(error=>{selection.uploads.delete(projectId);if(mediaSelection===selection){mediaStatus('');mediaError(error.message);}throw error;});
    selection.uploads.set(projectId,upload);
  }
  return selection.uploads.get(projectId);
}
const typeLabels={project:'Project',nonprofit:'Nonprofit',company:'Company / startup'};
const projectTags=new Set();
const projectTagSearch=document.getElementById('project-tag-search');
const projectTagGrid=document.getElementById('project-tags-grid');
function updateProjectTagState() {
  const count=document.getElementById('project-tag-count');
  count.textContent=`${projectTags.size} / 15 (min 1)`;
  count.classList.toggle('at-limit',projectTags.size===15);
  projectTagGrid.querySelectorAll('button').forEach(button=>{
    const selected=projectTags.has(button.value);
    button.setAttribute('aria-pressed',String(selected));
    button.disabled=!selected && projectTags.size>=15;
  });
}
function renderProjectTags() {
  const query=projectTagSearch.value.trim().toLowerCase();
  projectTagGrid.replaceChildren();
  const matches=allSkills.filter(skill=>!query || skill.toLowerCase().includes(query) || (skillSynonyms[skill] || []).some(alias=>alias.toLowerCase().includes(query)));
  for(const skill of matches){
    const button=document.createElement('button');
    button.type='button';button.className='chip-label';button.value=skill;button.textContent=skill;
    button.addEventListener('click',()=>{
      if(projectTags.has(skill))projectTags.delete(skill);
      else if(projectTags.size<15)projectTags.add(skill);
      updateProjectTagState();
    });
    projectTagGrid.appendChild(button);
  }
  if(!matches.length)projectTagGrid.textContent='No matching skills.';
  updateProjectTagState();
}
projectTagSearch.addEventListener('input',renderProjectTags);

async function editorRequest(url,options={}) {
  const response=await fetch(url,{credentials:'same-origin',...options});
  if(response.status===413)throw new Error('Choose a file up to 64 MB.');
  let data;
  try{data=await response.json();}catch{throw new Error('Request failed ('+response.status+'). Please try again.');}
  if(!response.ok)throw new Error(data.error || 'Request failed');
  return data;
}
const jsonOptions=body=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const projectPicker=document.getElementById('project-picker');
const projectPickerTrigger=document.getElementById('project-picker-trigger');
const projectPickerMenu=document.getElementById('project-picker-menu');
const projectPickerSearch=document.getElementById('project-picker-search');
const projectPickerOptions=document.getElementById('project-picker-options');
function closeProjectPicker(returnFocus=false) {
  projectPickerMenu.hidden=true;projectPickerTrigger.setAttribute('aria-expanded','false');
  if(returnFocus)projectPickerTrigger.focus();
}
function syncProjectPicker() {
  const project=ownedProjects.find(p=>p.id===projectSelect.value);
  const creating=projectSelect.value==='__new__';
  document.getElementById('project-picker-name').textContent=project?.fields.name || (creating ? 'Create a new project' : 'Choose a project');
  document.getElementById('project-picker-meta').textContent=project ? typeLabels[project.type] : creating ? 'Add your project details below' : 'Select an existing project or start a new one';
  document.getElementById('project-picker-mark').textContent=project ? project.fields.name.slice(0,1).toUpperCase() : creating ? '＋' : '↗';
  projectPickerTrigger.disabled=projectSelect.disabled;
}
function chooseProject(id) {
  projectSelect.value=id;projectSelect.dispatchEvent(new Event('change',{bubbles:true}));
  closeProjectPicker(true);
  if(id==='__new__')document.getElementById('new-project-name').focus();
}
function renderProjectChoices() {
  const query=projectPickerSearch.value.trim().toLowerCase();
  const matches=ownedProjects.filter(p=>[p.fields.name,p.fields.elevator_pitch,typeLabels[p.type]].some(value=>String(value || '').toLowerCase().includes(query)));
  projectPickerOptions.replaceChildren();
  for(const project of matches){
    const option=document.createElement('button');option.type='button';option.className='project-picker-option';
    option.setAttribute('aria-pressed',String(project.id===projectSelect.value));
    const copy=document.createElement('span');copy.className='project-picker-copy';
    const name=document.createElement('span');name.className='project-picker-name';name.textContent=project.fields.name;
    const meta=document.createElement('span');meta.className='project-picker-meta';meta.textContent=`${typeLabels[project.type]} · ${project.fields.elevator_pitch}`;
    copy.append(name,meta);option.append(copy);
    if(project.id===projectSelect.value){const check=document.createElement('span');check.className='project-picker-check';check.textContent='✓';check.setAttribute('aria-hidden','true');option.append(check);}
    option.addEventListener('click',()=>chooseProject(project.id));
    projectPickerOptions.append(option);
  }
  if(!matches.length){const empty=document.createElement('p');empty.className='project-picker-empty';empty.textContent=query ? 'No projects match your search.' : 'Your first project starts here.';projectPickerOptions.append(empty);}
}
projectPickerTrigger.addEventListener('click',()=>{
  if(!projectPickerMenu.hidden){closeProjectPicker();return;}
  projectPickerSearch.value='';renderProjectChoices();projectPickerMenu.hidden=false;
  projectPickerTrigger.setAttribute('aria-expanded','true');projectPickerSearch.focus();
});
projectPickerSearch.addEventListener('input',renderProjectChoices);
document.getElementById('project-picker-create').addEventListener('click',()=>chooseProject('__new__'));
projectPicker.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !projectPickerMenu.hidden){event.preventDefault();closeProjectPicker(true);}
  if(projectPickerMenu.hidden || !['ArrowDown','ArrowUp'].includes(event.key))return;
  const choices=[...projectPickerOptions.querySelectorAll('button'),document.getElementById('project-picker-create')];
  const index=choices.indexOf(document.activeElement);
  const next=index===-1 ? (event.key==='ArrowDown' ? 0 : choices.length-1) : (index+(event.key==='ArrowDown' ? 1 : -1)+choices.length)%choices.length;
  event.preventDefault();choices[next].focus();
});
document.addEventListener('click',event=>{if(!projectPicker.contains(event.target))closeProjectPicker();});
document.addEventListener('focusin',event=>{if(!projectPicker.contains(event.target))closeProjectPicker();});
function renderProjectOptions(selected='') {
  projectSelect.value=selected;
  syncProjectPicker();
}
function selectProject(resetPreference=true) {
  syncProjectPicker();
  const selected=ownedProjects.find(p=>p.id===projectSelect.value);
  projectPanel.hidden=projectSelect.value!=='__new__';
  postForm.hidden=!selected;
  projectSummary.textContent=selected ? `${typeLabels[selected.type]} · ${selected.fields.elevator_pitch}` : '';
  if(selected) {
    if(resetPreference)setOpportunityPreference(opportunityPreferenceDefaults[selected.type]);
  }
}
projectSelect.addEventListener('change',()=>{projectError.textContent='';selectProject();scheduleDraftSave();});
document.getElementById('create-project-btn').addEventListener('click',async()=>{
  const button=document.getElementById('create-project-btn');
  button.disabled=true;projectError.textContent='';
  try {
    const {project}=await editorRequest(editProjectId ? '/api/projects/'+encodeURIComponent(editProjectId) : '/api/projects',{method:editProjectId ? 'PATCH' : 'POST',...jsonOptions({
      type:document.getElementById('new-project-type').value,
      name:document.getElementById('new-project-name').value.trim(),
      elevator_pitch:document.getElementById('new-project-pitch').value.trim(),
      description:document.getElementById('new-project-description').value.trim(),
      field:projectType.value==='project' ? undefined : projectField.value,
      tags:[...projectTags]
    })});
    if(editProjectId){Panels.navigate('/feed?mine=1');return;}
    ownedProjects.push(project);renderProjectOptions(project.id);selectProject();
    document.getElementById(postKind()==='post' ? 'post-title' : 'looking-for').focus();
  } catch(error){projectError.textContent=error.message;}
  finally{button.disabled=false;}
});
function collectPostFields() {
  const promotion=document.getElementById('promote-option').hidden ? {} : {promoted:document.getElementById('post-promoted').checked};
  if(postKind()==='post')return {...promotion,kind:'post',project_id:projectSelect.value,title:document.getElementById('post-title').value.trim(),content:document.getElementById('post-content').value.trim()};
  return {...promotion,kind:'opportunity',project_id:projectSelect.value,looking_for:document.getElementById('looking-for').value.trim(),
    skills:selectedSkills,description:document.getElementById('description').value.trim(),
    details:document.getElementById('details').value.trim(),opportunity_preference:selectedOpportunityPreference,
    remote:remoteCheck.checked,location:remoteCheck.checked ? 'Remote' : (selectedLocation?.display || ''),
    latitude:remoteCheck.checked ? null : (selectedLocation?.lat || null),longitude:remoteCheck.checked ? null : (selectedLocation?.lon || null),
    contact_links:[...document.querySelectorAll('.contact-link-input')].map(el=>el.value.trim()).filter(Boolean)};
}
function draftStatus(message) {
  let el=document.getElementById('draft-indicator');
  if(!el){el=document.createElement('span');el.id='draft-indicator';el.style.fontSize='.75rem';document.querySelector('.btn-row').prepend(el);}
  el.textContent=message;
}
function scheduleDraftSave() {
  clearTimeout(draftTimer);
  if(!suppressAutoSave && !editId)draftTimer=setTimeout(saveDraft,800);
}
function saveDraft() {
  if(suppressAutoSave || editId || postForm.hidden)return draftSaving;
  const body=collectPostFields();
  const selection=body.kind==='post' ? mediaSelection : null;
  if(body.kind==='post' ? !body.title && !body.content && !selection && !draftIds.post : !body.looking_for && !body.description && !body.details && !body.skills.length && !body.contact_links.length)return draftSaving;
  draftSaving=draftSaving.then(async()=>{
    const media_id=await selectedMediaId(selection,body.project_id);
    const id=draftIds[body.kind];
    const result=await editorRequest('/api/drafts',{method:'POST',...jsonOptions({...body,media_id,...(id ? {id} : {})})});
    draftIds[body.kind]=result.id;
    if(postKind()===body.kind)currentDraftId=result.id;
    draftStatus('Draft saved');
  }).catch(error=>draftStatus('Draft not saved: '+error.message));
  return draftSaving;
}
postForm.addEventListener('input',scheduleDraftSave);
postForm.addEventListener('change',scheduleDraftSave);
async function loadFields(fields,projectId,kind='opportunity',asset=null) {
  suppressAutoSave=true;
  document.getElementById('post-promoted').checked=fields.promoted===true;
  opportunityToggle.checked=kind==='opportunity';updatePostKind();
  projectSelect.value=projectId || '';
  selectProject(false);
  if(kind==='post'){
    document.getElementById('post-title').value=fields.title || '';
    document.getElementById('post-content').value=fields.content || '';
    replaceMedia(asset ? {asset,projectId} : null);updatePostCounts();
    suppressAutoSave=false;return;
  }
  for(const [field,id] of [['looking_for','looking-for'],['description','description'],['details','details']])document.getElementById(id).value=fields[field] || '';
  for(const [id,counter] of [['looking-for','looking-for-count'],['description','desc-count'],['details','details-count']]) {
    const max=id==='details' ? 50 : 15;
    document.getElementById(counter).textContent=countWords(document.getElementById(id).value)+' / '+max;
  }
  await skillsReady;
  selectedSkills=canonicalizeSelectedSkills(fields.skills || []);loadedSkills=[...selectedSkills];renderSkills();showUnrecognizedSavedSkills();
  if(['paid','unpaid','volunteering'].includes(fields.opportunity_preference))setOpportunityPreference(fields.opportunity_preference);
  remoteCheck.checked=fields.remote!==false && fields.remote!=='false';
  locationField.style.display=remoteCheck.checked ? 'none' : 'block';
  if(!remoteCheck.checked && fields.location){
    selectedLocation={display:fields.location,lat:fields.latitude,lon:fields.longitude};
    locInput.value=fields.location;locDisplay.textContent=fields.location;locSelected.style.display='flex';locData.value=JSON.stringify(selectedLocation);
  }
  const container=document.getElementById('contact-links');container.replaceChildren();
  const links=Array.isArray(fields.contact_links) && fields.contact_links.length ? fields.contact_links : [''];
  for(const link of links){addContactLink();container.lastElementChild.querySelector('input').value=link;}
  if(!projectId)projectError.textContent='Choose a project to continue this saved draft.';
  suppressAutoSave=false;
}
postForm.addEventListener('submit',async event=>{
  event.preventDefault();projectError.textContent='';
  const body=collectPostFields();
  let valid=true;
  if(!ownedProjects.some(p=>p.id===body.project_id)){projectError.textContent='Choose a project';return;}
  if(body.kind==='post'){
    if(!body.title || countWords(body.title)>10 || body.title.length>130){projectError.textContent='Title must be 1–10 words and at most 130 characters';return;}
    if(!body.content || body.content.length>300){projectError.textContent='Content must be 1–300 characters';return;}
  }else{
  if(!body.looking_for || countWords(body.looking_for)>15){showError('looking-for','Required (max 15 words)');valid=false;}
  const unchangedLegacySkills=editId && JSON.stringify(body.skills)===JSON.stringify(loadedSkills);
  if(!unchangedLegacySkills && body.skills.length<MIN_SKILLS){showError('skills',`Select at least ${MIN_SKILLS} skills`);valid=false;}
  if(!body.description || countWords(body.description)>15){showError('desc','Required (max 15 words)');valid=false;}
  if(!remoteCheck.checked && !selectedLocation){showError('location','Select a location');valid=false;}
  if(!body.contact_links.length){showError('contact','Add at least one link');valid=false;}
  }
  if(!valid)return;
  const button=document.getElementById('submit-btn');button.disabled=true;
  suppressAutoSave=true;clearTimeout(draftTimer);await draftSaving;
  try{
    if(body.kind==='post'){
      if(!await mediaChoosing)throw new Error('Check the media file before posting.');
      body.media_id=await selectedMediaId(mediaSelection,body.project_id);
    }
    const endpoint=body.kind==='post' ? '/api/posts' : '/api/opportunities';
    const result=await editorRequest(editId ? endpoint+'/'+encodeURIComponent(editId) : endpoint,{method:editId ? 'PATCH' : 'POST',...jsonOptions(body)});
    if(result.message)alert(result.message);
    if(!editId && currentDraftId)await editorRequest('/api/drafts/'+encodeURIComponent(currentDraftId),{method:'DELETE'});
    Panels.navigate('/feed?mine=1&view=posts');
  }catch(error){projectError.textContent=error.message;button.disabled=false;suppressAutoSave=false;}
});
(async()=>{
  try{
    const auth=await editorRequest('/api/auth/me');
    document.getElementById('promote-option').hidden=auth.user?.username!=='anisohaney';
    if(auth.user?.role!=='admin'){
      const legal=await editorRequest('/api/legal/status');
      if(!legal.all_agreed){Panels.navigate('/agreement');return;}
    }
    ownedProjects=(await editorRequest('/api/projects/mine')).projects;
    renderProjectOptions();selectProject();
    await skillsReady;
    renderProjectTags();
    if(editProjectId){
      const project=ownedProjects.find(p=>p.id===editProjectId);
      if(!project)throw new Error('Project not found');
      projectSelect.value='__new__';selectProject();
      projectSelect.closest('.field').hidden=true;
      document.querySelector('h1').textContent='Edit project';
      document.querySelector('.page > p').textContent='Update your project details.';
      projectPanel.querySelector('h2').textContent='Project details';
      document.getElementById('new-project-type').value=project.type;
      await projectFieldsReady;projectField.value=project.fields.field || '';showProjectField();
      document.getElementById('new-project-name').value=project.fields.name;
      document.getElementById('new-project-pitch').value=project.fields.elevator_pitch;
      document.getElementById('new-project-description').value=project.fields.description || '';
      for(const tag of project.fields.tags || [])projectTags.add(tag);
      renderProjectTags();
      document.getElementById('create-project-btn').textContent='Save project';
      document.getElementById('cancel-project-edit').hidden=false;
      return;
    }
    if(editorParams.get('new_project')==='1'){projectSelect.value='__new__';selectProject();}
    if(editorParams.get('project')){
      const id=editorParams.get('project');
      if(!ownedProjects.some(p=>p.id===id))throw new Error('Project not found');
      projectSelect.value=id;selectProject();
    }
    if(editId){
      const kind=editorParams.get('kind')==='post' ? 'post' : 'opportunity';
      const post=await editorRequest((kind==='post' ? '/api/posts/' : '/api/opportunities/')+encodeURIComponent(editId));
      if(post.created_by!==auth.user.id && auth.user.role!=='admin')throw new Error('You cannot edit this post');
      if(post.project && !ownedProjects.some(p=>p.id===post.project.id)){ownedProjects.push(post.project);renderProjectOptions();}
      await loadFields({...post.fields,promoted:post.promoted===true},post.project_id,kind,post.media);
      opportunityToggle.disabled=true;
      projectSelect.disabled=true;
      syncProjectPicker();
      document.querySelector('h1').textContent=kind==='post' ? 'Edit post' : 'Edit opportunity';document.getElementById('submit-btn').textContent='Save changes';
    }else{
      const draftId=new URLSearchParams(location.search).get('draft');
      if(draftId){
        const drafts=(await editorRequest('/api/drafts')).drafts;
        const draft=drafts.find(d=>d.id===draftId);
        if(!draft)throw new Error('Draft not found');
        currentDraftId=draft.id;
        draftIds[draft.kind || 'opportunity']=draft.id;
        const matching=ownedProjects.filter(p=>p.type===draft.type && p.fields.name===draft.fields?.title);
        const projectId=draft.project_id || (matching.length===1 ? matching[0].id : '');
        await loadFields(draft.fields || {},projectId,draft.kind || 'opportunity',draft.media);
        document.querySelector('h1').textContent='Edit draft';
      }
    }
    suppressAutoSave=false;
  }catch(error){
    projectError.textContent=error.message;
    if(error.message==='Authentication required')Panels.navigate('/login');
  }
})();
