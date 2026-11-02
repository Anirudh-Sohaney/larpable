// Temporary content previews; application navigation always replaces the main page.
const Panels={
  embedded:window.top!==window || new URLSearchParams(location.search).get('embed')==='1',
  wide:()=>window.matchMedia('(min-width:1040px)').matches,
  temporary(url){
    return ['/post','/opportunity'].includes(url.pathname) && url.searchParams.has('id')
      || url.pathname==='/profile' && url.searchParams.has('id')
      || url.pathname==='/edit_profile'
      || url.pathname==='/create_student' && (url.searchParams.has('edit') || url.searchParams.has('edit_project'));
  },
  init(){
    if(this.ready)return;this.ready=true;
    if(this.embedded)document.documentElement.classList.add('d-embed');
    document.addEventListener('click',event=>{
      if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
      const link=event.target.closest('a[href]');
      if(link?.target==='_blank' || link?.hasAttribute('download'))return;
      let href=link?.getAttribute('href');
      if(!link && !event.target.closest('button,input,textarea,select,label,video,audio,summary,[contenteditable]'))href=event.target.closest('[data-pane-href]')?.dataset.paneHref;
      if(!href || href.startsWith('#'))return;
      const url=new URL(href,location.href);
      if(url.origin!==location.origin)return;
      document.querySelectorAll('.d-opp-card.is-active').forEach(card=>card.classList.remove('is-active'));
      event.target.closest('.d-opp-card')?.classList.add('is-active');
      if(!this.embedded)this.opener=event.target.closest('a,[data-pane-href]');
      event.preventDefault();event.stopImmediatePropagation();
      if(link?.hasAttribute('data-pane-return') || link?.closest('.d-bottom-nav'))this.returnTo(url.href);
      else this.navigate(url.href);
    },true);
    document.addEventListener('keydown',event=>{
      if(event.target.matches?.('[data-pane-href]') && (event.key==='Enter' || event.key===' ')){
        event.preventDefault();this.navigate(event.target.dataset.paneHref);
      }
    });
    if(this.embedded){
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape' && !document.querySelector('dialog[open]') && window.parent!==window)window.parent.document.getElementById('detail-close')?.click();
      });
      return;
    }
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
    host.append(pane);
    document.getElementById('detail-frame').addEventListener('load',()=>{
      pane.classList.remove('is-loading');pane.setAttribute('aria-busy','false');
    });
    return host;
  },
  navigate(href){
    const url=new URL(href,location.href);
    if(!this.temporary(url)){this.returnTo(url.href);return;}
    if(this.embedded){url.searchParams.set('embed','1');location.replace(url.href);return;}
    if(!this.wide() || !this.ensureHost()){location.href=url.href;return;}
    url.searchParams.set('embed','1');
    const frame=document.getElementById('detail-frame');
    frame.title='Details';
    document.getElementById('detail-close').setAttribute('aria-label','Close details');
    let current=frame.src;
    try{current=frame.contentWindow?.location.href || current;}catch{}
    if(current===url.href && document.getElementById('split').classList.contains('is-open'))return;
    const pane=document.getElementById('detail-pane');
    pane.classList.add('is-loading');pane.setAttribute('aria-busy','true');
    if(frame.contentWindow)frame.contentWindow.location.replace(url.href);
    else frame.src=url.href;
    document.getElementById('split').classList.add('is-open');
    document.getElementById('detail-pane').setAttribute('aria-hidden','false');
    if(typeof FeedVideos!=='undefined')FeedVideos.schedule();
  },
  returnTo(href){
    const url=new URL(href,location.href);
    url.searchParams.delete('embed');
    if(url.origin!==location.origin)return;
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
    const frame=document.getElementById('detail-frame');if(frame)frame.src='about:blank';
    this.opener?.focus({preventScroll:true});
    if(typeof FeedVideos!=='undefined')FeedVideos.schedule();
  }
};
