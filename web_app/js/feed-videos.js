// One playback owner for the feed and its same-origin detail pane.
const FeedVideos = {
  videos: new Map(), active: null, sequence: 0, direction: 1, frameDocument: null, blocked: new WeakSet(),

  init() {
    if(this.started)return;
    this.started=true;
    this.onScroll=event=>{
      const doc=event.target.ownerDocument || (event.target.nodeType===9 ? event.target : document);
      const surface=event.target.nodeType===9 ? doc : event.target;
      const y=surface===doc ? doc.defaultView.scrollY : surface.scrollTop;
      const previous=this.scrollPositions.get(surface) ?? y;
      if(y!==previous)this.direction=y>previous ? 1 : -1;
      this.scrollPositions.set(surface,y);this.schedule();
    };
    this.scrollPositions=new WeakMap();this.scrollPositions.set(document,window.scrollY);
    document.addEventListener('scroll',this.onScroll,true);
    this.onGesture=event=>this.retryAfterGesture(event);
    document.addEventListener('click',this.onGesture);
    document.addEventListener('keydown',this.onGesture);
    window.addEventListener('resize',()=>this.schedule());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.focus(null);else this.schedule();});
    this.onFullscreen=()=>this.schedule();
    document.addEventListener('fullscreenchange',this.onFullscreen);
    window.addEventListener('pagehide',()=>this.focus(null));
    window.addEventListener('pageshow',()=>this.schedule());
    this.resizeObserver=new ResizeObserver(()=>this.schedule());
    this.listObserver=new MutationObserver(()=>this.refresh());
    const list=document.getElementById('list');
    if(list){this.listObserver.observe(list,{childList:true,subtree:true});this.resizeObserver.observe(list);}
    document.getElementById('detail-frame')?.addEventListener('load',()=>this.refresh());
    this.refresh();
  },

  refresh() {
    if(!this.started)return;
    const frame=document.getElementById('detail-frame');
    const doc=frame?.contentDocument;
    if(doc!==this.frameDocument){
      this.frameObserver?.disconnect();this.frameDocument?.removeEventListener('scroll',this.onScroll,true);
      this.frameDocument?.removeEventListener('fullscreenchange',this.onFullscreen);
      this.frameDocument?.removeEventListener('click',this.onGesture);
      this.frameDocument?.removeEventListener('keydown',this.onGesture);
      this.frameDocument=doc;
      if(doc){
        this.scrollPositions.set(doc,doc.defaultView.scrollY);
        doc.addEventListener('scroll',this.onScroll,true);
        doc.addEventListener('fullscreenchange',this.onFullscreen);
        doc.addEventListener('click',this.onGesture);
        doc.addEventListener('keydown',this.onGesture);
        this.frameObserver=new MutationObserver(()=>this.refresh());
        this.frameObserver.observe(doc,{childList:true,subtree:true});
      }
    }
    const current=new Set([...document.querySelectorAll('#list video'),...(doc?.querySelectorAll('video') || [])]);
    for(const [video,state] of this.videos)if(!current.has(video)){
      video.pause();video.removeEventListener('play',state.guard);video.removeEventListener('playing',state.guard);
      video.removeEventListener('loadedmetadata',state.loaded);this.resizeObserver.unobserve(video);this.videos.delete(video);
      if(this.active===video)this.active=null;
    }
    for(const video of current)if(!this.videos.has(video)){
      video.muted=false;video.defaultMuted=false;video.playsInline=true;video.loop=true;
      const guard=()=>{
        if(document.hidden || this.active!==video || !this.fullyVisible(video)){video.pause();return;}
        this.blocked.delete(video);
        this.pauseOthers(video);
      };
      const loaded=()=>this.schedule();
      this.videos.set(video,{full:false,entered:0,guard,loaded});
      video.addEventListener('play',guard);video.addEventListener('playing',guard);video.addEventListener('loadedmetadata',loaded);
      this.resizeObserver.observe(video);
    }
    this.schedule();
  },

  schedule() {
    if(this.scheduled)return;
    this.scheduled=requestAnimationFrame(()=>{this.scheduled=null;this.update();});
  },

  fullyVisible(video) {
    const rect=video.getBoundingClientRect(), doc=video.ownerDocument, view=doc.defaultView;
    if(!video.isConnected || !rect.width || !rect.height || view.getComputedStyle(video).visibility!=='visible')return false;
    const fullscreen=this.frameDocument?.fullscreenElement || document.fullscreenElement;
    if(fullscreen)return fullscreen===video;
    const fits=(box,clip)=>box.top>=clip.top-.5 && box.left>=clip.left-.5 && box.bottom<=clip.bottom+.5 && box.right<=clip.right+.5;
    if(!fits(rect,{top:0,left:0,bottom:view.innerHeight,right:doc.documentElement.clientWidth}))return false;
    // Account for scroll containers as well as the browser viewport.
    for(let node=video.parentElement;node;node=node.parentElement){
      const style=view.getComputedStyle(node), box=node.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowY) && (rect.top<box.top+node.clientTop-.5 || rect.bottom>box.top+node.clientTop+node.clientHeight+.5))return false;
      if(/auto|scroll|hidden|clip/.test(style.overflowX) && (rect.left<box.left+node.clientLeft-.5 || rect.right>box.left+node.clientLeft+node.clientWidth+.5))return false;
    }
    let screen=rect;
    if(doc!==document){
      const frame=document.getElementById('detail-frame'), box=frame.getBoundingClientRect();
      if(!box.width || !box.height || document.getElementById('detail-pane')?.getAttribute('aria-hidden')==='true')return false;
      screen={top:rect.top+box.top+frame.clientTop,bottom:rect.bottom+box.top+frame.clientTop,left:rect.left+box.left+frame.clientLeft,right:rect.right+box.left+frame.clientLeft};
      if(!fits(screen,{top:0,left:0,bottom:window.innerHeight,right:document.documentElement.clientWidth}))return false;
    }
    const nav=document.querySelector('.d-bottom-nav')?.getBoundingClientRect();
    return !nav || screen.bottom<=nav.top || screen.top>=nav.bottom || screen.right<=nav.left || screen.left>=nav.right;
  },

  screenTop(video) {
    return video.getBoundingClientRect().top+(video.ownerDocument===document ? 0 : document.getElementById('detail-frame').getBoundingClientRect().top);
  },

  update() {
    if(document.hidden){this.focus(null);return;}
    const entering=[];
    for(const [video,state] of this.videos){
      const full=this.fullyVisible(video);
      if(full && !state.full)entering.push(video);
      state.full=full;
    }
    // If a fast scroll brings several in together, the leading edge wins:
    // bottommost when scrolling down, topmost when scrolling up.
    entering.sort((a,b)=>this.direction*(this.screenTop(a)-this.screenTop(b)));
    for(const video of entering)this.videos.get(video).entered=++this.sequence;
    let next=null, newest=-1;
    for(const [video,state] of this.videos)if(state.full && state.entered>newest){next=video;newest=state.entered;}
    this.focus(next);
  },

  pauseOthers(except) {
    for(const video of this.videos.keys())if(video!==except && !video.paused)video.pause();
  },

  focus(video) {
    if(this.active===video){this.pauseOthers(video);return;}
    this.active=video;this.pauseOthers(video);
    if(!video)return;
    this.play(video);
  },

  retryAfterGesture(event) {
    const video=this.active;
    // Retry sound only after a real interaction, never after a manual pause.
    if(event.isTrusted && !event.defaultPrevented && video && this.blocked.has(video) && !document.hidden && this.fullyVisible(video))this.play(video);
  },

  play(video) {
    this.blocked.delete(video);this.pauseOthers(video);
    const refused=error=>{if(error?.name==='NotAllowedError' && this.active===video)this.blocked.add(video);};
    // Catch autoplay refusal and late play() completion after focus has moved.
    try{Promise.resolve(video.play()).then(()=>{if(this.active!==video || document.hidden)video.pause();},refused);}catch(error){refused(error);}
  }
};
