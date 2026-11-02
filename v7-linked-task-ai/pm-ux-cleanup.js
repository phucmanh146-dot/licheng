/* Group existing tools; preserve their original markup, handlers and account data. */
(function(){
 'use strict';if(window.SYPMUX)return;
 const q=(s,root=document)=>root.querySelector(s);
 function drawer(host,element,id,title){
   if(!element || element.closest('#'+id))return;
   let old=q('#'+id);if(old)old.remove();
   let details=document.createElement('details');details.id=id;details.className='pma-source-drawer';
   const summary=document.createElement('summary');summary.textContent=title;details.append(summary);
   element.parentNode.insertBefore(details,element);details.append(element);
 }
 function improve(){
   const host=q('#knowledgeBody');if(!host)return;
   const root=q('#pma-root',host);if(!root)return;
   if(root.parentElement!==host)host.append(root);
   const wx=q('#sywx-root',host);
   if(wx && wx.parentElement!==host && !wx.closest('#pma-wechat-import'))host.insertBefore(wx,root);
   const toolbar=q('.sykv-toolbar',host);
   if(toolbar)drawer(host,toolbar,'pma-legacy-tools','🧰 旧版知识库连接 / 文档导入工具（保留）');
   const wechat=q('#sywx-root',host);
   if(wechat)drawer(host,wechat,'pma-wechat-import','💬 微信资料：群聊关键词检索与授权导入');
   else{const old=q('#pma-wechat-import');if(old)old.remove()}
   if(q('.pma-quick-nav',root))return;
   const nav=document.createElement('nav');nav.className='pma-quick-nav';nav.setAttribute('aria-label','快速找到资料入口');
   const targets=[['📚 Obsidian','#pma-notes'],['🔗 链接 / 上传','#pma-url'],['💬 微信框选','#pma-wx-frame'],['🟦 资料池','#pma-pool-zone'],['🤖 问 Agent','#pma-question']];
   for(const [label,id] of targets){
     const btn=document.createElement('button');btn.type='button';btn.textContent=label;
     btn.onclick=()=>{
       const target=q(id,host);if(!target)return;
       const parent=target.closest('details');if(parent)parent.open=true;
       if(target.tagName==='DETAILS')target.open=true;
       target.scrollIntoView({block:'center',behavior:'smooth'});
       if(['INPUT','TEXTAREA'].includes(target.tagName))target.focus({preventScroll:true});
     };
     nav.append(btn);
   }
   const head=q('.pma-head',root);if(head)head.after(nav);else root.prepend(nav);
 }
 let pending=false;
 new MutationObserver(()=>{
   if(pending)return;pending=true;
   requestAnimationFrame(()=>{pending=false;improve()});
 }).observe(document.documentElement,{childList:true,subtree:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',improve);else improve();
 window.SYPMUX={improve};
})();