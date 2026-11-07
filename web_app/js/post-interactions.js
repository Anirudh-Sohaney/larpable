/* Shared regular-post gestures and controls. Video surfaces never toggle playback. */
const PostInteractions = {
  pending:new Set(), tap:null,
  heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  button(post){return `<span class="d-post-like"><button class="d-post-heart" type="button" data-like-button aria-pressed="${!!post.liked}" aria-label="${post.liked ? 'Unlike' : 'Like'} post (${post.like_count || 0} likes)">${this.heart}</button><span data-like-count aria-hidden="true">${post.like_count || 0}</span></span>`;},
  video(url){return `<div class="d-post-video"><video class="d-post-media" playsinline loop preload="metadata" src="${Utils.escapeHtml(url)}"></video><div class="d-video-controls"><button type="button" data-video-play aria-label="Play video">Play</button><input type="range" data-video-seek aria-label="Video position" min="0" max="100" step="0.1" value="0"><button type="button" data-video-mute aria-label="Mute video">Mute</button><button type="button" data-video-fullscreen aria-label="Full screen">Full screen</button></div></div>`;},
  animate(root){
    root.querySelector('.d-like-overlay')?.remove();
    const media=root.querySelector('.d-post-media'),host=media?.closest('.d-post-video') || root;
    const box=(media || root).getBoundingClientRect(),parent=host.getBoundingClientRect();
    const layer=document.createElement('span');layer.className='d-like-overlay';layer.setAttribute('aria-hidden','true');
    Object.assign(layer.style,{left:(box.left-parent.left-host.clientLeft+host.scrollLeft)+'px',top:(box.top-parent.top-host.clientTop+host.scrollTop)+'px',width:box.width+'px',height:box.height+'px'});
    const burst=document.createElement('span');burst.className='d-like-burst';burst.innerHTML=this.heart;
    const size=Math.min(90,box.width*.35,box.height*.35);
    burst.style.width=burst.style.height=size+'px';burst.style.setProperty('--like-rise',-Math.min(90,box.height*.2)+'px');
    layer.append(burst);host.append(layer);
    burst.addEventListener('animationend',()=>layer.remove(),{once:true});
  },
  async like(root,onlyLike=false){
    if(!DataStore.requireAuth())return;
    const id=root.dataset.likeId,button=root.querySelector('[data-like-button]');
    if(!button || this.pending.has(id))return;
    const liked=button.getAttribute('aria-pressed')==='true';
    if(onlyLike && liked){this.animate(root);return;}
    this.pending.add(id);button.disabled=true;
    try{
      const result=await DataStore.request('/api/posts/'+encodeURIComponent(id)+'/like',{method:onlyLike || !liked ? 'POST' : 'DELETE'});
      const notify=view=>view.dispatchEvent(new view.CustomEvent('post-liked',{detail:{id,...result}}));
      notify(window);if(window.parent!==window)notify(window.parent);
      if(result.liked)this.animate(root);
    }catch(error){alert(error.message);}
    finally{this.pending.delete(id);button.disabled=false;}
  },
  init(){
    window.addEventListener('post-liked',event=>{
      const {id,liked,like_count}=event.detail;
      if(typeof Feed!=='undefined')for(const post of [...Feed.opportunities,...Feed.myPosts])if(post.id===id)Object.assign(post,event.detail);
      document.querySelectorAll('[data-like-id]').forEach(root=>{
        if(root.dataset.likeId!==id)return;
        const count=root.querySelector('[data-like-count]');if(count)count.textContent=like_count;
        const button=root.querySelector('[data-like-button]');
        button?.setAttribute('aria-pressed',String(liked));button?.setAttribute('aria-label',`${liked ? 'Unlike' : 'Like'} post (${like_count} likes)`);
      });
    });
    document.addEventListener('click',event=>{
      const root=event.target.closest('[data-like-id]');if(!root || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
      const like=event.target.closest('[data-like-button]');
      if(like){event.preventDefault();event.stopImmediatePropagation();this.like(root);return;}
      const controls=event.target.closest('.d-video-controls');
      if(controls){
        const video=controls.parentElement.querySelector('video');
        const button=event.target.closest('button');if(!button)return;
        event.preventDefault();event.stopImmediatePropagation();
        if(button.hasAttribute('data-video-play')){if(video.paused)video.play().catch(()=>{});else video.pause();}
        if(button.hasAttribute('data-video-mute'))video.muted=!video.muted;
        if(button.hasAttribute('data-video-fullscreen'))controls.parentElement.requestFullscreen?.().catch(()=>{});
        return;
      }
      if(event.target.closest('.d-post-like,button,input,textarea,select,label,summary,[contenteditable]') || event.detail===0)return;
      const link=event.target.closest('a[href]');
      if(link?.target==='_blank')return;
      event.preventDefault();event.stopImmediatePropagation();
      const now=performance.now();
      if(this.tap?.root===root && now-this.tap.at<=500){clearTimeout(this.tap.timer);this.tap=null;this.like(root,true);return;}
      if(this.tap)clearTimeout(this.tap.timer);
      // Delay post navigation only long enough to distinguish the requested double tap.
      const href=link?.href || (!event.target.closest('.d-post-video') ? root.dataset.paneHref : null);
      const timer=setTimeout(()=>{this.tap=null;if(root.isConnected && href)Panels.navigate(href);},500);
      this.tap={root,at:now,timer};
    },true);
    document.addEventListener('input',event=>{
      if(!event.target.matches('[data-video-seek]'))return;
      const video=event.target.closest('.d-post-video').querySelector('video');
      if(Number.isFinite(video.duration))video.currentTime=video.duration*Number(event.target.value)/100;
    });
    const sync=event=>{
      const video=event.target;if(!video.matches?.('.d-post-video video'))return;
      const controls=video.parentElement.querySelector('.d-video-controls');
      if(event.type!=='timeupdate'){
        const play=controls.querySelector('[data-video-play]'),mute=controls.querySelector('[data-video-mute]');
        play.textContent=video.paused ? 'Play' : 'Pause';play.setAttribute('aria-label',video.paused ? 'Play video' : 'Pause video');
        mute.textContent=video.muted ? 'Unmute' : 'Mute';mute.setAttribute('aria-label',video.muted ? 'Unmute video' : 'Mute video');
      }
      if(Number.isFinite(video.duration))controls.querySelector('input').value=video.currentTime/video.duration*100;
    };
    for(const type of ['play','pause','volumechange','timeupdate','loadedmetadata'])document.addEventListener(type,sync,true);
  }
};
PostInteractions.init();
