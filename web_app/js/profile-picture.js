/* Shared cropper: one small canvas, no dependencies or full-size uploads. */
const ProfilePicture = {
  mount(root, userId) {
    root.innerHTML = `<h3>Profile picture <small>(optional)</small></h3><p>Choose an image up to 12 MB.</p><img class="d-profile-picture" width="96" height="96" alt="Current profile picture" ${userId ? `src="/api/profiles/${encodeURIComponent(userId)}/picture"` : 'hidden'}><label class="d-picture-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"><span class="d-picture-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5"/></svg></span><span class="d-picture-picker-copy"><strong>Choose a photo</strong><small data-file-name>JPG, PNG, WebP, GIF or AVIF</small></span><span class="d-picture-picker-action">Browse</span></label><dialog class="d-picture-crop" aria-label="Adjust profile picture"><h2>Adjust your picture</h2><p>Drag or use arrow keys to position your picture.</p><canvas width="256" height="256" tabindex="0" aria-label="Picture crop. Drag or use arrow keys to position."></canvas><label>Zoom <input type="range" min="1" max="4" step="0.01" value="1"></label><div class="d-picture-actions"><button type="button" class="d-btn" data-cancel>Cancel</button><button type="button" class="d-btn d-btn-accent" data-apply>Use picture</button></div></dialog><p role="alert"></p>`;
    const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),crop=root.querySelector('dialog'),zoom=root.querySelector('[type=range]'),error=root.querySelector('[role=alert]'),preview=root.querySelector('img');
    let saved;
    let image=null,x=0,y=0,scale=1,busy=false,sequence=0;
    const draw=()=>{
      if(!image)return;
      const w=image.width*scale,h=image.height*scale;
      x=Math.max(256-w,Math.min(0,x));y=Math.max(256-h,Math.min(0,y));
      ctx.clearRect(0,0,256,256);ctx.drawImage(image,x,y,w,h);
    };
    root.querySelector('[type=file]').onchange=async event=>{
      const file=event.target.files[0];if(!file)return;
      root.querySelector('[data-file-name]').textContent=file.name;
      const request=++sequence;busy=true;error.textContent='';
      try{
        if(file.size>12*1024*1024)throw new Error('Choose an image up to 12 MB.');
        const next=await createImageBitmap(file);
        if(request!==sequence){next.close();return;}
        if(next.width*next.height>40000000){next.close();throw new Error('Choose an image up to 40 megapixels.');}
        image?.close();image=next;zoom.value=1;scale=Math.max(256/image.width,256/image.height);
        x=(256-image.width*scale)/2;y=(256-image.height*scale)/2;crop.showModal();draw();canvas.focus();
      }catch(e){error.textContent=e.message || 'This image format cannot be opened by your browser.';}
      finally{if(request===sequence)busy=false;event.target.value='';}
    };
    zoom.oninput=()=>{if(!image)return;const previous=scale;scale=Math.max(256/image.width,256/image.height)*Number(zoom.value);x=128-(128-x)*scale/previous;y=128-(128-y)*scale/previous;draw();};
    let drag;
    canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};};
    canvas.onpointermove=e=>{if(!drag)return;const ratio=256/canvas.getBoundingClientRect().width;x+=(e.clientX-drag.x)*ratio;y+=(e.clientY-drag.y)*ratio;drag={x:e.clientX,y:e.clientY};draw();};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
    canvas.onkeydown=e=>{const direction={ArrowLeft:[8,0],ArrowRight:[-8,0],ArrowUp:[0,8],ArrowDown:[0,-8]}[e.key];if(direction){e.preventDefault();x+=direction[0];y+=direction[1];draw();}};
    crop.querySelector('[data-cancel]').onclick=()=>crop.close();
    crop.querySelector('[data-apply]').onclick=()=>{
      saved=canvas.toDataURL('image/webp',0.85);preview.src=saved;preview.hidden=false;crop.close();
    };
    crop.onclose=()=>{image?.close();image=null;};
    return {value(){if(busy || crop.open)throw new Error('Finish adjusting your picture first.');return saved===undefined ? {} : {profile_picture:saved};}};
  }
};
