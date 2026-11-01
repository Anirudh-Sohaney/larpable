// A shared right pane: content navigation never replaces the main tab on wide screens.
const Panels={
  embedded:window.top!==window || new URLSearchParams(location.search).get('embed')==='1',
  wide:()=>window.matchMedia('(min-width:1040px)').matches,
  init(){
    if(this.ready)return;this.ready=true;
    if(this.embedded)document.documentElement.classList.add('d-embed');
    document.addEventListener('click',event=>{
      if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
      const link=event.target.closest('a[href]');
      if(link?.closest('.d-bottom-nav') || link?.target==='_blank' || link?.hasAttribute('download'))return;
      let href=link?.getAttribute('href');
      if(!link && !event.target.closest('button,input,textarea,select,label,video,audio,summary,[contenteditable]'))href=event.target.closest('[data-pane-href]')?.dataset.paneHref;
      if(!href || href.startsWith('#'))return;
      const url=new URL(href,location.href);
      if(url.origin!==location.origin || (!this.embedded && !['/profile','/post','/opportunity','/edit_profile','/create_student','/feed','/feedback'].includes(url.pathname)))return;
      document.querySelectorAll('.d-opp-card.is-active').forEach(card=>card.classList.remove('is-active'));
      event.target.closest('.d-opp-card')?.classList.add('is-active');
      event.preventDefault();event.stopImmediatePropagation();this.navigate(url.href);
    },true);
    document.addEventListener('keydown',event=>{
      if(event.target.matches?.('[data-pane-href]') && (event.key==='Enter' || event.key===' ')){
        event.preventDefault();this.navigate(event.target.dataset.paneHref);
      }
    });
    if(this.embedded)return;
    this.ensureHost();
    document.getElementById('detail-close')?.addEventListener('click',()=>this.close());
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && !document.querySelector('dialog[open]'))this.close();});
    window.addEventListener('resize',()=>{if(!this.wide())this.close();});
  },
  ensureHost(){
    let host=document.getElementById('split');
    if(host)return host;
    const main=document.querySelector('main,.page,.d-profile,.d-feedback-page');
    if(!main)return null;
    host=document.createElement('div');host.id='split';host.className='d-split';
    main.before(host);host.append(main);main.classList.add('d-pane-main');
    const pane=document.createElement('aside');pane.id='detail-pane';pane.className='d-detail-pane';pane.setAttribute('aria-hidden','true');
    pane.innerHTML='<button class="d-detail-close" id="detail-close" type="button" aria-label="Close details">×</button><iframe class="d-detail-frame" id="detail-frame" title="Details"></iframe>';
    host.append(pane);return host;
  },
  navigate(href){
    const url=new URL(href,location.href);
    if(this.embedded){url.searchParams.set('embed','1');location.href=url.href;return;}
    if(!this.wide() || !this.ensureHost()){location.href=url.href;return;}
    url.searchParams.set('embed','1');
    const frame=document.getElementById('detail-frame');
    frame.title='Details';
    document.getElementById('detail-close').setAttribute('aria-label','Close details');
    frame.src=url.href;document.getElementById('split').classList.add('is-open');
    document.getElementById('detail-pane').setAttribute('aria-hidden','false');
    if(typeof FeedVideos!=='undefined')FeedVideos.schedule();
  },
  returnTo(href){
    const url=new URL(href,location.href);
    url.searchParams.delete('embed');
    if(this.embedded && window.parent!==window){
      window.parent.document.getElementById('split')?.classList.remove('is-open');
      window.parent.document.getElementById('detail-pane')?.setAttribute('aria-hidden','true');
      window.parent.location.href=url.href;
    }else location.href=url.href;
  },
  close(){
    document.querySelectorAll('.d-opp-card.is-active').forEach(card=>card.classList.remove('is-active'));
    document.getElementById('split')?.classList.remove('is-open');
    document.getElementById('detail-pane')?.setAttribute('aria-hidden','true');
    if(typeof FeedVideos!=='undefined')FeedVideos.schedule();
  }
};
