const Filters = {
  category:'f-sort',
  groups:{
    'f-sort':{name:'Sort',options:[['foryou','For you'],['newest','Newest'],['oldest','Oldest']]},
    'f-pay':{name:'Pay',options:[['','All'],['unpaid','Unpaid'],['paid','Paid']]},
    'f-kind':{name:'Posts',options:[['','All'],['opportunity','Opportunities']]},
    'f-location':{name:'Location',options:[['','All'],['inperson','In person'],['remote','Remote']]}
  },
  defaultValue(id){return id==='f-sort' ? (Feed.guest ? 'newest' : 'foryou') : '';},
  renderPicker(){
    const list=document.getElementById('filter-options');if(!list)return;
    const active=Object.entries(this.groups).filter(([id])=>document.getElementById(id).value!==this.defaultValue(id));
    list.innerHTML=(active.length ? '<div class="d-applied-filters"><h3>Applied filters</h3>'+active.map(([id,group])=>{
      const label=group.options.find(([value])=>value===document.getElementById(id).value)?.[1] || '';
      return `<button type="button" data-filter-remove="${id}" aria-label="Remove ${group.name}: ${label}"><span>${group.name}: ${label}</span><span aria-hidden="true">&times;</span></button>`;
    }).join('')+'</div>' : '')+`<h3>${this.groups[this.category].name}</h3>`+this.groups[this.category].options.map(([value,label])=>`<button class="d-filter-option" type="button" data-filter-value="${value}" aria-pressed="${document.getElementById(this.category).value===value}">${label}<span aria-hidden="true">${document.getElementById(this.category).value===value ? '&#10003;' : ''}</span></button>`).join('');
    document.querySelectorAll('[data-filter-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filterCategory===this.category)));
  },
  values() {
    const value=id=>document.getElementById(id)?.value || '';
    return {pay:value('f-pay'),kind:value('f-kind'),location:value('f-location')};
  },
  init() {
    const dialog=document.getElementById('feed-filter-dialog');
    document.getElementById('filters-open')?.addEventListener('click',()=>{this.renderPicker();dialog.showModal();});
    dialog?.addEventListener('click',event=>{
      const category=event.target.closest('[data-filter-category]');
      if(category){this.category=category.dataset.filterCategory;this.renderPicker();return;}
      const remove=event.target.closest('[data-filter-remove]'),option=event.target.closest('[data-filter-value]');
      if(!remove && !option)return;
      const id=remove ? remove.dataset.filterRemove : this.category;
      document.getElementById(id).value=remove ? this.defaultValue(id) : option.dataset.filterValue;
      Feed.currentSort=document.getElementById('f-sort').value;Feed.render();this.renderPicker();
      if(option)document.querySelector('#filter-options [aria-pressed="true"]')?.focus({preventScroll:true});
    });
    for(const id of ['filters-close','filters-apply'])document.getElementById(id)?.addEventListener('click',()=>dialog.close());
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
      rows.sort((a,b)=>Number(b.promoted===true)-Number(a.promoted===true));
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
    document.getElementById('filters-open')?.classList.toggle('is-set',active);
    return active;
  },
  clearAll() {
    for(const id of ['q','f-pay','f-kind','f-location']){const input=document.getElementById(id);if(input)input.value='';}
    Feed.currentSort=Feed.guest ? 'newest' : 'foryou';
    const sort=document.getElementById('f-sort');if(sort)sort.value=Feed.currentSort;
  }
};
