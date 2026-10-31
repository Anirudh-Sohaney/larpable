const Filters = {
  values() {
    const value=id=>document.getElementById(id)?.value || '';
    return {pay:value('f-pay'),kind:value('f-kind'),location:value('f-location')};
  },
  init() {
    for(const id of ['f-sort','f-pay','f-kind','f-location'])document.getElementById(id)?.addEventListener('change',()=>{
      Feed.currentSort=document.getElementById('f-sort').value;Feed.render();
    });
    document.getElementById('clear')?.addEventListener('click',()=>{this.clearAll();Feed.render();});
  },
  apply(posts,filters=this.values()) {
    return posts.filter(post=>{
      const opportunity=post.kind!=='post';
      if(filters.kind==='opportunity' && !opportunity)return false;
      if(filters.pay){
        if(!opportunity)return false;
        const pay=post.opportunity_preference || (post.type==='company' ? 'paid' : 'unpaid');
        if((pay==='paid' ? 'paid' : 'unpaid')!==filters.pay)return false;
      }
      if(filters.location){
        if(!opportunity)return false;
        const remote=post.remote===true || post.remote==='true' || (post.remote==null && /remote/i.test(post.location || ''));
        const inperson=post.remote===false || post.remote==='false' || (post.remote==null && !!post.location && !remote);
        if(filters.location==='remote' ? !remote : !inperson)return false;
      }
      return true;
    });
  },
  sort(posts,order,scores={}) {
    const rows=[...posts];
    const timestamp=post=>Date.parse(post.created_at || '') || 0;
    rows.sort((a,b)=>order==='oldest' ? timestamp(a)-timestamp(b) : timestamp(b)-timestamp(a));
    if(order==='foryou'){
      rows.sort((a,b)=>(scores[b.id] || 0)-(scores[a.id] || 0));
      rows.sort((a,b)=>(b.unread_reply_comment_id ? 1 : 0)-(a.unread_reply_comment_id ? 1 : 0));
    }
    return rows;
  },
  updateControls() {
    const defaultSort=Feed.guest ? 'newest' : 'foryou';
    let active=false;
    for(const id of ['f-sort','f-pay','f-kind','f-location']){
      const select=document.getElementById(id);if(!select)continue;
      const chosen=select.value!==(id==='f-sort' ? defaultSort : '');
      select.classList.toggle('is-set',chosen);active ||= chosen;
    }
    return active;
  },
  clearAll() {
    for(const id of ['q','f-pay','f-kind','f-location']){const input=document.getElementById(id);if(input)input.value='';}
    Feed.currentSort=Feed.guest ? 'newest' : 'foryou';
    const sort=document.getElementById('f-sort');if(sort)sort.value=Feed.currentSort;
  }
};
