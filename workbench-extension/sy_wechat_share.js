/* Only captures the window selected by the user in the browser's picker. */
(() => {
  'use strict';
  let stream = null, job = '', busy = false, epoch = 0, floatId = '', floatTimer, floatTicket = 0;
  let cropSource = null, cropRect = null, dragging = false;
  let followTimer, followSerial = 0, lastSignature = '', candidateSignature = '', followAfter = 0;
  const sample = document.createElement('canvas'); sample.width = 160; sample.height = 100;
  const preview = $('sharedPreview'), state = $('shareState'), cropCanvas = $('sharedCropCanvas');
  const say = text => { state.textContent = text; };
  const fold = collapsed => { if (parent !== window) parent.postMessage({type:'sy-remote-fold',collapsed},parentOrigin); };
  function invalidate() {followSerial++; lastSignature = candidateSignature = ''; followAfter = Date.now()+2200;}
  function signature() {
    const ctx = sample.getContext('2d', {willReadFrequently:true}); ctx.drawImage(preview,0,0,160,100);
    const pixels = ctx.getImageData(0,0,160,100).data; let hash = 2166136261;
    for (let i=0;i<pixels.length;i+=8) hash = Math.imul(hash ^ pixels[i] ^ (pixels[i+1]<<8) ^ (pixels[i+2]<<16),16777619);
    return String(hash >>> 0);
  }
  async function follow(current) {
    if (!stream || current !== epoch) return;
    try {
      if (!$('followResults').checked || busy || searching || cropSource || Date.now()<followAfter) return;
      const sig = signature();
      if (sig !== candidateSignature) {candidateSignature=sig;return;}
      if (sig === lastSignature) return;
      const ticket=followSerial; lastSignature=sig;
      $('followState').textContent='画面已停稳，正在更新当前搜索列表…';
      const result=await api('/wechat-screen-follow',snapshot());
      if (current!==epoch || ticket!==followSerial || busy || searching || cropSource || !$('followResults').checked || signature()!==sig) return;
      window.SYWechatLists.follow(result);
      $('followState').textContent=result.idle?'画面继续跟随；等待进入微信搜索列表。':'已跟随微信搜索“'+result.keyword+'” · 已选内容保留';
    } catch(e) {
      if (current===epoch) $('followState').textContent='本次列表未更新：'+e.message;
    } finally {if(stream && current===epoch) followTimer=setTimeout(()=>follow(current),1400);}
  }
  function buttons() {
    $('shareWechat').disabled = busy;
    for (const id of ['searchShared','readShared','floatShared','cropShared']) $(id).disabled = !stream || busy || searching;
    $('refreshShared').disabled = !stream || !job || busy || searching;
    $('stopShared').disabled = !stream;
    $('search').disabled = busy || searching;
    $('openWechat').disabled = busy || searching;
    $('sharedEmpty').hidden = !!stream;
    $('connectionBadge').textContent = stream ? '微信画面跟随中' : '尚未连接微信';
    document.body.dataset.shared = String(!!stream);
  }
  function stopFloat() {
    floatTicket++; clearTimeout(floatTimer); const id = floatId; floatId = '';
    if (id) fetch('/wechat-float-stop', {method:'POST',headers:{'Content-Type':'application/json','X-SY-Token':token},body:JSON.stringify({id}),keepalive:true}).catch(()=>{});
  }
  function cancelCrop() { cropSource = null; cropRect = null; dragging = false; $('sharedCropArea').hidden = true; preview.hidden = !stream; }
  function stopSharing() {
    epoch++; job = ''; busy = false; clearTimeout(followTimer); invalidate(); stopFloat(); cancelCrop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; preview.srcObject = null; preview.hidden = true;
    buttons(); say('共享已停止。');
    $('followState').textContent='连接后，画面停稳时更新可确认的搜索结果。';
  }
  function meta() {
    const track = stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live' || !preview.videoWidth) throw Error('共享画面已停止或还未加载。');
    return {displaySurface:track.getSettings().displaySurface,windowLabel:track.label,width:preview.videoWidth,height:preview.videoHeight};
  }
  function snapshot() {
    const info = meta(), canvas = document.createElement('canvas'), scale = Math.min(1,2400/preview.videoWidth,1800/preview.videoHeight);
    canvas.width = Math.round(preview.videoWidth*scale); canvas.height = Math.round(preview.videoHeight*scale);
    canvas.getContext('2d').drawImage(preview,0,0,canvas.width,canvas.height);
    return {...info,image:canvas.toDataURL('image/png')};
  }
  async function recognizeCrop(image, current = epoch) {
    if (busy || searching) { say('正在处理前一次读取，请稍后再次框选。'); return; }
    invalidate(); busy = true; buttons();
    try {
      say('只识别你框选的区域…');
      const doc = await api('/wechat-crop-read',{image}); if (current !== epoch) return;
      const text = (doc.lines || []).map(x=>x.text).filter(Boolean).join('\n').trim();
      if (!text) return say('框选区域没有识别出清晰文字，请放大微信后再试。');
      window.SYWechatLists.addCrop(text,image); say('框选内容已列在下方。可以继续在微信操作，最后勾选要带入的内容。');
    } catch(e) { if (current === epoch) say(e.message); }
    finally { if (current === epoch) { busy = false; buttons(); } }
  }
  async function pollFloat(ticket, current) {
    if (!floatId || ticket !== floatTicket || current !== epoch) return;
    try {
      const data = await api('/wechat-float-poll',{id:floatId});
      if (ticket !== floatTicket || current !== epoch) return;
      for (const event of data.events || []) {
        if (event.type === 'capture') {invalidate(); followAfter=Date.now()+15000; await api('/wechat-float-frame',{...snapshot(),id:floatId});}
        if (event.type === 'crop') await recognizeCrop(event.image,current);
        if (event.type === 'show') fold(false);
        if (event.type === 'error') say(event.message);
        if (event.type === 'stop') { stopSharing(); cancelSearch(); fold(false); return; }
      }
    } catch(e) { if (ticket === floatTicket && current === epoch) { stopFloat(); say('浮动操作条未连接：'+e.message+' 仍可在预览中框选。'); fold(false); } }
    finally { if (floatId && ticket === floatTicket && current === epoch) floatTimer = setTimeout(()=>pollFloat(ticket,current),700); }
  }
  async function startFloat() {
    const current = epoch; stopFloat(); const ticket = floatTicket;
    try {
      const result = await api('/wechat-float-start',meta());
      if (current !== epoch || ticket !== floatTicket) { api('/wechat-float-stop',{id:result.id}).catch(()=>{}); return; }
      floatId = result.id; say('小操作条已跟随微信。你可以自由点击、滚动和移动微信，点“框选”后再拉框。'); fold(true);
      pollFloat(ticket,current);
    } catch(e) { if (current === epoch) say('共享已连接。'+e.message+' 你也可以点“在预览中框选”。'); }
  }
  $('shareWechat').onclick = async () => {
    stopSharing();
    if (!navigator.mediaDevices?.getDisplayMedia) return say('请使用电脑上的 Chrome 或 Edge 共享微信窗口。');
    const current = epoch;
    try {
      const selected = await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'window'},audio:false,selfBrowserSurface:'exclude',monitorTypeSurfaces:'exclude'});
      if (current !== epoch) { selected.getTracks().forEach(t=>t.stop()); return; }
      const track = selected.getVideoTracks()[0];
      if (track.getSettings().displaySurface !== 'window') { selected.getTracks().forEach(t=>t.stop()); return say('请选择单独的微信窗口，整屏或标签页不适用。'); }
      stream = selected; preview.srcObject = stream; preview.hidden = false;
      track.addEventListener('ended',()=>{if(current===epoch){stopSharing();cancelSearch();fold(false);}});
      await preview.play(); if(current!==epoch)return; buttons(); followTimer=setTimeout(()=>follow(current),1400); await startFloat();
    } catch(e) { if(current!==epoch)return;stopSharing();say(e.name==='NotAllowedError'?'请在浏览器弹窗里选择微信聊天窗口并点击共享。':'共享未开始：'+e.message); }
  };
  $('floatShared').onclick = startFloat;
  $('cropShared').onclick = () => {
    try {
      invalidate();
      meta(); const scale = Math.min(1,2400/preview.videoWidth,1800/preview.videoHeight);
      cropCanvas.width=Math.round(preview.videoWidth*scale);cropCanvas.height=Math.round(preview.videoHeight*scale);
      cropSource=document.createElement('canvas');cropSource.width=cropCanvas.width;cropSource.height=cropCanvas.height;
      cropSource.getContext('2d').drawImage(preview,0,0,cropSource.width,cropSource.height); cropRect=null;
      preview.hidden=true;$('sharedCropArea').hidden=false;paintCrop();say('拖动框选需要的内容，再点“确认并识别”。');
    } catch(e) {say(e.message);}
  };
  function point(e){const b=cropCanvas.getBoundingClientRect();return{x:Math.max(0,Math.min(cropCanvas.width,(e.clientX-b.left)*cropCanvas.width/b.width)),y:Math.max(0,Math.min(cropCanvas.height,(e.clientY-b.top)*cropCanvas.height/b.height))};}
  function paintCrop(){const ctx=cropCanvas.getContext('2d');ctx.drawImage(cropSource,0,0);if(cropRect){ctx.strokeStyle='#ffc337';ctx.lineWidth=3;ctx.strokeRect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);}}
  cropCanvas.onpointerdown=e=>{dragging=true;cropRect={...point(e),w:0,h:0};cropCanvas.setPointerCapture(e.pointerId);};
  cropCanvas.onpointermove=e=>{if(!dragging)return;const p=point(e);cropRect.w=p.x-cropRect.x;cropRect.h=p.y-cropRect.y;paintCrop();};
  cropCanvas.onpointerup=e=>{if(dragging)cropCanvas.onpointermove(e);dragging=false;};cropCanvas.onpointercancel=()=>{dragging=false;};
  $('cancelSharedCrop').onclick=cancelCrop;
  $('confirmSharedCrop').onclick=async()=>{
    if(!cropSource||!cropRect||Math.abs(cropRect.w)<16||Math.abs(cropRect.h)<16)return say('请先拉出至少16像素宽和高的选框。');
    const out=document.createElement('canvas');out.width=Math.round(Math.abs(cropRect.w));out.height=Math.round(Math.abs(cropRect.h));
    out.getContext('2d').drawImage(cropSource,Math.min(cropRect.x,cropRect.x+cropRect.w),Math.min(cropRect.y,cropRect.y+cropRect.h),Math.abs(cropRect.w),Math.abs(cropRect.h),0,0,out.width,out.height);
    const image=out.toDataURL('image/png');cancelCrop();await recognizeCrop(image);
  };
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&cropSource){e.preventDefault();cancelCrop();}});
  async function readResults(current) {
    const result=await api('/wechat-screen-read',{...snapshot(),searchId:job});if(current!==epoch)return;
    renderResults(result);say('当前可见结果已列出，请选择群聊或勾选消息。');
  }
  $('searchShared').onclick=async()=>{
    if(busy||searching)return;
    const keyword=$('groupQuery').value.trim()||$('keyword').value.trim();if(!keyword)return say('填写群名或消息关键词。');
    if(window.SYWechatLists.group()) return $('readShared').click();
    invalidate(); const current=epoch;busy=true;job='';buttons();
    try{say('正在微信搜索并生成候选列表…');const result=await api('/wechat-screen-start',{...snapshot(),keyword});if(current!==epoch)return;job=result.searchId;await new Promise(r=>setTimeout(r,1000));if(current===epoch)await readResults(current);}
    catch(e){if(current===epoch)say(e.message);}finally{if(current===epoch){busy=false;buttons();}}
  };
  $('refreshShared').onclick=async()=>{if(busy||searching)return;invalidate();const current=epoch;busy=true;buttons();try{await readResults(current);}catch(e){if(current===epoch)say(e.message);}finally{if(current===epoch){busy=false;buttons();}}};
  $('readShared').onclick=async()=>{
    if(busy||searching)return;
    const group=window.SYWechatLists.group(),keyword=group?$('keyword').value.trim():($('groupQuery').value.trim()||$('keyword').value.trim());
    if(!keyword)return say('填写与微信搜索框一致的关键词。');invalidate();const current=epoch;busy=true;buttons();
    try{say('正在读取当前共享画面…');const result=await api('/wechat-screen-read',{...snapshot(),keyword,group,manual:true});if(current===epoch){renderResults(result);say('已列出当前搜索画面中的内容，请勾选。');}}
    catch(e){if(current===epoch)say(e.message);}finally{if(current===epoch){busy=false;buttons();}}
  };
  $('stopShared').onclick=()=>{stopSharing();cancelSearch();fold(false);};
  $('foldPanel').onclick=()=>{fold(true);say('面板已收起，可继续操作微信。');};
  $('openWechat').onclick=async()=>{try{const result=await api('/wechat-open');note(result.note);}catch(e){note(e.message);}};
  $('followResults').onchange=()=>{invalidate();$('followState').textContent=$('followResults').checked?'画面停稳后，继续跟随当前搜索结果。':'列表跟随已暂停；实时画面继续显示。';};
  window.SYSharedWechat={connected:()=>!!stream,invalidate,search:()=>$('searchShared').onclick(),
    async openTarget(target){invalidate();const result=await api('/wechat-screen-open',{...snapshot(),...target});fold(true);return result;}};
  window.addEventListener('pagehide',stopSharing);window.addEventListener('sy-native-search-state',buttons);
  window.SYSharedWechatBusy=()=>busy;
  window.addEventListener('message',e=>{if(e.source===parent&&allowedParents.includes(e.origin)&&e.data==='sy-remote-stop')stopSharing();});
})();
