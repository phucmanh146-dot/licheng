(function(){
"use strict";
function ready(){
 const btn=document.getElementById('aiP2Nav');
 if(btn){btn.title="工作台内置 AI 助手；可按需读取已连接的 Obsidian 笔记";btn.setAttribute('aria-label','连接 AI');}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
