(function(){
'use strict';
const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function clean(s){return String(s||'').replace(/https?:\/\/\S+/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_>#]/g,'').replace(/\u0060/g,'').replace(/\s+/g,' ').trim();}
function parse(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n');let title='',sections=[],current=null,plain=[];
 for(const raw of lines){const line=raw.trim();if(!line)continue;
  const h=line.match(/^#{1,4}\s+(.+)$/);
  if(h){current={title:clean(h[1]).slice(0,60),items:[]};sections.push(current);if(!title)title=current.title;continue;}
  const bullet=line.match(/^(?:[-*•]\s+|\d{1,2}[.)、]\s+)(.+)$/);
  if(bullet){const item=clean(bullet[1]);if(item){if(current)current.items.push(item);else plain.push(item);}continue;}
  if(line.startsWith('\u0060\u0060\u0060')||/^https?:\/\//.test(line))continue;
  const sentence=clean(line);if(!sentence)continue;
  if(!title)title=sentence.slice(0,70);
  if(current)current.items.push(sentence);else plain.push(sentence);
 }
 if(!title)title='AI 回答要点';
 let branches=sections.map(s=>({title:s.title,items:s.items.filter(Boolean)})).filter(s=>s.title||s.items.length);
 if(!branches.length)branches=plain.map((item,i)=>({title:'要点 '+(i+1),items:[item]}));
 branches=branches.slice(0,8).map((b,i)=>({title:b.title||('分支 '+(i+1)),items:b.items.slice(0,4)}));
 if(branches.length===1&&branches[0].items.length>1){const items=branches[0].items;branches=items.slice(0,8).map((x,i)=>({title:'要点 '+(i+1),items:[x]}));}
 if(!branches.length)branches=[{title:'核心内容',items:[clean(text).slice(0,180)||'暂无可识别内容']}];
 return {title,branches};
}
function openMap(text){
 const data=parse(text),dialog=E('dialog','p2-mindmap-dialog'),shell=E('div','p2-mindmap-shell'),head=E('div','p2-mindmap-head');
 head.append(E('div','p2-mindmap-title','AI 回答 · 思维导图'));
 const close=E('button','p2-mindmap-close','关闭');close.type='button';close.onclick=()=>dialog.close();head.append(close);
 const hint=E('p','p2-mindmap-hint','根据本轮 AI 回答自动整理；如原回答缺少标题或行动项，导图会按可识别内容生成，建议对照原文核验。');
 const canvas=E('div','p2-mindmap-canvas'),core=E('div','p2-mindmap-core',data.title);canvas.append(core);
 const branches=E('div','p2-mindmap-branches');
 data.branches.forEach((branch,i)=>{const card=E('section','p2-mindmap-branch');card.append(E('div','p2-mindmap-branch-title',branch.title||('分支 '+(i+1))));const list=E('ul','p2-mindmap-list');(branch.items.length?branch.items:['展开查看原回答']).forEach(item=>list.append(E('li','',item.slice(0,260))));card.append(list);branches.append(card);});
 canvas.append(branches);const actions=E('div','p2-mindmap-actions');const copy=E('button','p2-mindmap-copy','复制导图大纲');copy.type='button';copy.onclick=()=>{const outline=[data.title,...data.branches.map(b=>'- '+b.title+(b.items.length?'\n'+b.items.map(x=>'  - '+x).join('\n'):''))].join('\n');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(outline).then(()=>{copy.textContent='已复制大纲';}).catch(()=>{copy.textContent='复制失败，请手动选中';});else{copy.textContent='当前浏览器不支持一键复制';}};actions.append(copy);
 shell.append(head,hint,canvas,actions);dialog.append(shell);document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
}
function createButton(text){const b=E('button','p2-mindmap-create','🧠 生成思维导图');b.type='button';b.addEventListener('click',()=>openMap(text));return b;}
window.P2MindMap={createButton,parse,version:'1.0-20261023'};
})();