/* One lazily created explanation shared by the profile and feed. */
const LarpScoreInfo = {
  button:'<button class="d-score-info" type="button" data-score-info aria-label="About LarpScore" aria-haspopup="dialog"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6v.5"/></svg></button>',
  open(){
    let dialog=document.getElementById('larpscore-info');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='larpscore-info';dialog.className='d-score-dialog';dialog.setAttribute('aria-labelledby','larpscore-info-title');
      dialog.innerHTML=`<header><h2 id="larpscore-info-title">LarpScore</h2><button type="button" class="d-btn d-btn-sm" aria-label="Close LarpScore popup">Close</button></header><section><h3>What is LarpScore?</h3><ul><li>LarpScore reflects your activity on LARPABLE.</li><li>It helps show that you are a real, engaged member who contributes to our community.</li></ul></section><section><h3>Why does LarpScore matter?</h3><ul><li>LARPABLE introduces mentors and investors, giving students opportunities to connect with people who can support their projects.</li><li>These connections are reserved for students who meet a LarpScore requirement, helping mentors and investors find students who care about growth and are building something real.</li></ul></section><section><h3>How can I increase my LarpScore?</h3><ul><li>Share your project, create posts and opportunities for other students, and encourage meaningful engagement with your posts.</li><li>Join conversations on posts from other students and apply to opportunities they create. Consistent, thoughtful participation builds your presence in the community.</li></ul></section>`;
      dialog.querySelector('button').onclick=()=>dialog.close();
      document.body.append(dialog);
    }
    if(!dialog.open)dialog.showModal();
  }
};
document.addEventListener('click',event=>{
  if(!event.target.closest('[data-score-info]'))return;
  event.preventDefault();event.stopImmediatePropagation();LarpScoreInfo.open();
},true);
