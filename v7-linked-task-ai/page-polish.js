(function(){
  'use strict';
  function addConnectionEntry(){
    var top=document.querySelector('#appHome .app-topbar-right');
    if(!top||top.querySelector('[data-pp="ai"]'))return;
    var entry=document.createElement('button');entry.type='button';entry.className='pp-ai-entry';entry.dataset.pp='ai';entry.textContent='✳ 连接 AI';top.prepend(entry);
  }
  document.addEventListener('click', function(event){
    var button = event.target.closest && event.target.closest('[data-pp="capture"]');
    if(button && window.SY && typeof SY.openQuickCapture === 'function') SY.openQuickCapture();
    var ai=event.target.closest&&event.target.closest('[data-pp="ai"]');
    if(ai&&window.SYRescue)SYRescue.configure();
  });
  addConnectionEntry();
})();
