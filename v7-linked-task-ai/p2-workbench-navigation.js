/* Show P2 within original Shanganya main navigation; preserve its existing login, tasks and notes. */
(function(){
 'use strict';
 const nav=document.getElementById('aiP2Nav');
 const view=document.getElementById('view-ai-p2');
 const frame=document.getElementById('embeddedP2Frame');
 if(!nav||!view||!frame)return;
 function adapt(){
   if(view.hidden)return;
   try{
     const inner=frame.contentDocument;
     if(inner&&inner.body){
       inner.body.classList.add('p2-embedded');
       const back=inner.querySelector('.p2-back');
       if(back)back.hidden=true;
       const tag=inner.querySelector('.p2-top-title span');
       if(tag)tag.textContent='工作台内置 P2';
       const status=document.getElementById('embeddedP2Status');
       if(status)status.textContent='已嵌入原工作台 · Obsidian 笔记可按需关联';
     }
   }catch(_){ }
 }
 frame.addEventListener('load',adapt);
 nav.addEventListener('click',()=>requestAnimationFrame(adapt));
 // Allow bookmarked original-page links, without leaving the original workbench.
 if(location.hash==='#ai-p2'){
   const run=()=>{const btn=document.getElementById('aiP2Nav');if(btn)btn.click()};
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else setTimeout(run,300);
 }
})();
