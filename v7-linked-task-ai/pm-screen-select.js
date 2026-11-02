/* Manual, local-only WeChat window capture + selection. Never record in background. */
(function(){
'use strict';if(window.SYPMScreenSelect)return;
const q=(sel,host=document)=>host.querySelector(sel),e=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x};
let capture=null,selection=null,busy=false;
function clearSelection(){selection=null;const apply=q('#pma-wx-apply'),rect=q('#pma-wx-rect'),coords=q('#pma-wx-coords');if(apply)apply.disabled=true;if(rect)rect.style.display='none';if(coords)coords.textContent='';}
function mapSelection(a,b,display,source){const clamp=(v,max)=>Math.min(max,Math.max(0,v));const x1=Math.floor(clamp(Math.min(a.x,b.x),display.width)*source.width/display.width),y1=Math.floor(clamp(Math.min(a.y,b.y),display.height)*source.height/display.height);const x2=Math.min(source.width,Math.ceil(clamp(Math.max(a.x,b.x),display.width)*source.width/display.width)),y2=Math.min(source.height,Math.ceil(clamp(Math.max(a.y,b.y),display.height)*source.height/display.height));return {x:x1,y:y1,width:x2-x1,height:y2-y1};}
async function post(path,payload={}){
const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),45000);
try{const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});
let j=await res.json().catch(()=>({error:'服务没有返回JSON'}));
if(!res.ok||j.error)throw Error(j.error||('HTTP '+res.status));
return j;}catch(err){if(err.name==='AbortError')throw Error('截图或识别超过45秒，请确认本机桥接服务在线后重试。');throw err;}finally{clearTimeout(timer);}
}
function tell(s,bad=false){const x=q('#pma-wx-msg');if(x){x.textContent=s;x.dataset.error=String(bad)}}
let toolbarTimer=null,toolbarSession='',toolbarAfter=0,toolbarOwner='',toolbarPolling=false;
function receiveToolbarCrop(r){
if(!window.SYPMUpgrade||!r?.file?.id)return;
SYPMUpgrade.addExternalAttachment(r.file);
SYPMUpgrade.addExternalMaterial({id:'wechat-crop:'+r.file.id,source:'wechat-screen',title:'微信框选资料 '+new Date().toLocaleString(),content:r.content||'已确认的微信选区截图，可交给视觉模型分析。',selected:true,importedAt:new Date().toISOString()});
document.dispatchEvent(new CustomEvent('sywx:crop-ready',{detail:r}));
tell('微信浮窗选区已加入资料池。'+(r.content?'识别文字 '+r.content.length+' 字。':'暂无 OCR 文字，截图已关联。'));
}
function attachToolbar(sessionId){
if(!sessionId)return;
if(toolbarTimer)clearInterval(toolbarTimer);
toolbarSession=sessionId;toolbarAfter=0;toolbarOwner=String(window.SY?.currentAccountKey||'');
if(!toolbarOwner)return tell('请先登录工作台，再接收微信框选资料。',true);
try{sessionStorage.setItem('sywx-toolbar',JSON.stringify({sessionId,owner:toolbarOwner}));}catch{}
const poll=async()=>{
if(toolbarPolling)return;
if(String(window.SY?.currentAccountKey||'')!==toolbarOwner){clearInterval(toolbarTimer);return;}
toolbarPolling=true;const activeSession=toolbarSession,activeOwner=toolbarOwner;
try{const r=await post('/api/pm/desktop-tool/events',{sessionId:activeSession,after:toolbarAfter});
if(activeSession!==toolbarSession||activeOwner!==String(window.SY?.currentAccountKey||''))return;
for(const event of r.events||[]){receiveToolbarCrop(event.result);toolbarAfter=Math.max(toolbarAfter,Number(event.seq)||0);}
if(!r.running){clearInterval(toolbarTimer);tell('微信浮窗已关闭；已确认的资料仍保留。');}
}catch(err){clearInterval(toolbarTimer);tell('微信浮窗连接中断：'+err.message,true);}
finally{toolbarPolling=false}
};
toolbarTimer=setInterval(poll,1500);poll();
}

let desktopOpening=null;
async function openDesktop(){if(desktopOpening)return desktopOpening;desktopOpening=(async()=>{const r=await post('/api/pm/desktop-tool/start');attachToolbar(r.sessionId);tell(r.note);return r;})();try{return await desktopOpening}finally{desktopOpening=null}}
function make(){const panel=e('details','pma-wechat-screen');panel.id='pma-wx-frame';
panel.innerHTML=`<summary>备用：在工作台内预览截图并框选</summary>
<p class="pma-help">仅在你点击时读取本机微信窗口。先打开微信的相关群聊，再点“截取微信窗口”；鼠标拖出矩形，选中后可交给 AI 识别。不会后台连续录制或自动读取全部聊天。</p>
<div class="pma-actions"><button type="button" id="pma-wx-desktop" class="pma-primary">进入微信 · 右上角浮窗框选</button><button type="button" id="pma-wx-shot" class="pma-primary">截取当前微信窗口</button><button id="pma-wx-repeat" type="button" class="pma-ghost" disabled>复查上次框选区域</button></div>
<div class="pma-wx-canvas" id="pma-wx-canvas"><img id="pma-wx-img" alt="你授权抓取的微信窗口画面"><div class="pma-wx-rect" id="pma-wx-rect"></div></div>
<div class="pma-actions"><button id="pma-wx-apply" type="button" class="pma-primary" disabled>把框选区域加入蓝色资料池 →</button><span id="pma-wx-coords" class="pma-help"></span></div><p id="pma-wx-msg" role="status" class="pma-help">等待你授权框选。</p>`;
async function takeCapture(){if(busy)return false;busy=true;capture=null;clearSelection();q('#pma-wx-repeat').disabled=true;tell('正在读取可见的微信窗口…');try{
const r=await post('/api/pm/screen-capture');
if(!r.captureId||!r.image||!r.width||!r.height)throw Error('没有取得有效微信截图，请重新截取。');
const img=q('#pma-wx-img');await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('截图显示失败，请重试。'));img.src=r.image;});capture=r;q('#pma-wx-canvas').style.display='block';
q('#pma-wx-rect').style.display='none';q('#pma-wx-apply').disabled=true;
tell('截图已准备好。按住鼠标拖动选择聊天区域，再点“加入资料池”。');return true;}catch(err){capture=null;clearSelection();q('#pma-wx-canvas').style.display='none';tell(err.message,true);return false;}finally{busy=false}}
q('#pma-wx-desktop',panel).onclick=async()=>{try{await openDesktop()}catch(err){tell(err.message,true)}};
q('#pma-wx-shot',panel).onclick=takeCapture;
const box=q('#pma-wx-canvas',panel),img=q('#pma-wx-img',panel),rect=q('#pma-wx-rect',panel);
let origin=null;
box.addEventListener('pointerdown',event=>{
if(busy||!capture||!img.complete||!img.naturalWidth||event.button!==0)return;
const r=img.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return;
clearSelection();event.preventDefault();origin={x:event.clientX-r.left,y:event.clientY-r.top};box.setPointerCapture(event.pointerId);
rect.style.display='block';rect.style.left=origin.x+'px';rect.style.top=origin.y+'px';rect.style.width='0px';rect.style.height='0px';
});
box.addEventListener('pointermove',event=>{
if(!origin)return;const r=img.getBoundingClientRect(),x=Math.min(Math.max(0,event.clientX-r.left),r.width),y=Math.min(Math.max(0,event.clientY-r.top),r.height);
rect.style.left=Math.min(x,origin.x)+'px';rect.style.top=Math.min(y,origin.y)+'px';rect.style.width=Math.abs(x-origin.x)+'px';rect.style.height=Math.abs(y-origin.y)+'px';
});
box.addEventListener('pointerup',event=>{
if(!origin||!capture)return;
const r=img.getBoundingClientRect(),endX=Math.min(Math.max(0,event.clientX-r.left),r.width),endY=Math.min(Math.max(0,event.clientY-r.top),r.height);
const {x,y,width,height}=mapSelection(origin,{x:endX,y:endY},r,capture);
origin=null;if(box.hasPointerCapture(event.pointerId))box.releasePointerCapture(event.pointerId);if(width<30||height<30){clearSelection();tell('框选范围太小，请重新拖动。',true);return}
selection={x,y,width,height};q('#pma-wx-apply').disabled=false;
q('#pma-wx-coords').textContent='已选 '+width+' × '+height+' 像素';tell('已选区域。点击“加入蓝色资料池”，才会解析。');
});
box.addEventListener('pointercancel',()=>{origin=null;clearSelection();tell('拖动已取消，请重新框选。');});
box.addEventListener('lostpointercapture',()=>{if(origin){origin=null;clearSelection();tell('拖动已中断，请重新框选。');}});
async function sendSelection(){
if(!selection||!capture)return tell('请先拖动框选区域',true);if(busy)return;busy=true;tell('正在分析你选的区域…');
try{
const r=await post('/api/pm/screen-crop',{captureId:capture.captureId,...selection});
if(window.SYPMUpgrade){
window.SYPMUpgrade.addExternalAttachment(r.file);
window.SYPMUpgrade.addExternalMaterial({id:'wechat-crop:'+r.file.id,source:'wechat-screen',title:'微信框选资料 '+new Date().toLocaleString(),
content:r.content||'框选了微信聊天截图，等待你向 AI 提问并由视觉模型分析。',selected:true,importedAt:new Date().toISOString()});
}
q('#pma-wx-repeat').disabled=false;
document.dispatchEvent(new CustomEvent('sywx:crop-ready',{detail:{file:r.file,content:r.content,ocrNote:r.ocrNote}}));
tell('已加入资料池并关联真实截图。'+(r.content?'识别文字 '+r.content.length+' 字。':'OCR 未提取出文字，仍可使用模型视觉分析。')+(r.ocrNote||''))
}catch(err){tell('框选失败：'+err.message,true)}finally{busy=false}
}
q('#pma-wx-apply',panel).onclick=sendSelection;
q('#pma-wx-repeat',panel).onclick=async()=>{
if(!selection)return;
const copy={...selection},previous=capture&&{width:capture.width,height:capture.height};
if(!await takeCapture())return;
if(!previous||capture.width!==previous.width||capture.height!==previous.height){clearSelection();return tell('微信窗口尺寸已变化，请在新截图上重新框选，避免识别错位。',true);}
selection=copy;q('#pma-wx-apply').disabled=false;await sendSelection()
};
return panel}
function mount(){
const root=q('#pma-root');if(!root||q('#pma-wx-frame'))return;
const pool=q('#pma-pool-zone',root);if(pool)pool.insertAdjacentElement('beforebegin',make());
const fromHash=location.hash.match(/toolbar-session=([A-Za-z0-9_-]+)/);let saved=null;try{saved=JSON.parse(sessionStorage.getItem('sywx-toolbar')||'null')}catch{}
if(fromHash){attachToolbar(fromHash[1]);history.replaceState(null,'',location.pathname+location.search+'#wechat-remote');q('#pma-wx-frame').open=true;}
else if(saved?.owner===String(window.SY?.currentAccountKey||''))attachToolbar(saved.sessionId);
}
new MutationObserver(()=>{if(q('#pma-root')&&!q('#pma-wx-frame'))mount()}).observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.SYPMScreenSelect={mount,openDesktop};
})();