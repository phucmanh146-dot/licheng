(function(){
'use strict';
const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
let activeDialog=null;
function scenesFrom(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n');
 const sections=[];let current={title:'核心结论',body:[]};
 for(const raw of lines){
  const line=raw.trim();
  if(!line)continue;
  const heading=line.match(/^#{1,4}\s+(.+)$/);
  if(heading){if(current.body.length||current.title!=='核心结论')sections.push(current);current={title:heading[1].replace(/[*_\x60]/g,'').slice(0,60),body:[]};continue;}
  if(/^[-*•]\s+/.test(line)||/^\d+[.、)]\s*/.test(line)){current.body.push(line.replace(/^[-*•]\s+|^\d+[.、)]\s*/,''));continue;}
  if(/^https?:\/\//i.test(line)||/^\[[^\]]+\]\(https?:/i.test(line))continue;
  current.body.push(line.replace(/\*\*|__|\x60/g,''));
 }
 if(current.body.length||!sections.length)sections.push(current);
 const flattened=[];
 for(const s of sections){
  const body=s.body.join(' ').trim();
  if(!body)continue;
  const chunks=body.match(/.{1,280}(?:\s|$)|.{1,280}/g)||[body];
  for(let i=0;i<chunks.length;i+=3)flattened.push({title:s.title,body:chunks.slice(i,i+3).join(' ').trim()});
 }
 return flattened.slice(0,12);
}
function wrap(ctx,text,maxWidth,maxLines){
 const words=Array.from(String(text||''));const lines=[];let line='';
 for(const ch of words){const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch;if(lines.length>=maxLines)break;}else line=test;}
 if(line&&lines.length<maxLines)lines.push(line);
 if(lines.length===maxLines&&Array.from(text||'').length>lines.join('').length)lines[lines.length-1]=lines[lines.length-1].slice(0,-1)+'…';
 return lines;
}
function paint(ctx,w,h,scene,index,total,progress,title){
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#0b1722');bg.addColorStop(1,'#153d45');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#6be0b0';ctx.fillRect(78,70,8,70);
 ctx.font='600 22px "Microsoft YaHei",sans-serif';ctx.fillStyle='#b6d7d4';ctx.fillText('SHANGANYA  /  AI RESULT',108,92);
 ctx.font='700 21px "Microsoft YaHei",sans-serif';ctx.fillStyle='#8be6c0';ctx.fillText('第 '+(index+1)+' / '+total+' 页',w-210,92);
 ctx.font='700 45px "Microsoft YaHei",sans-serif';ctx.fillStyle='#ffffff';
 const heads=wrap(ctx,scene.title||'分析结果',w-220,2);heads.forEach((x,i)=>ctx.fillText(x,108,190+i*58));
 ctx.fillStyle='#9db9bd';ctx.fillRect(108,220+(heads.length-1)*58,w-216,2);
 ctx.font='400 29px "Microsoft YaHei",sans-serif';ctx.fillStyle='#e4eff0';
 const lines=wrap(ctx,scene.body,w-250,8);lines.forEach((x,i)=>ctx.fillText(x,110,292+(heads.length-1)*50+i*47));
 ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(108,h-95,w-216,5);
 ctx.fillStyle='#6be0b0';ctx.fillRect(108,h-95,(w-216)*progress,5);
 ctx.font='18px "Microsoft YaHei",sans-serif';ctx.fillStyle='#a9c2c3';ctx.fillText('基于本轮 AI 回答生成 · 请核对原文与引用',108,h-52);
 ctx.font='18px "Microsoft YaHei",sans-serif';ctx.fillStyle='#a9c2c3';ctx.fillText(title.slice(0,32),w-420,h-52);
}
function createButton(text){
 const b=E('button','p2-video-create','▶ 生成字幕复盘视频');b.type='button';
 b.addEventListener('click',()=>makeVideo(text,b));return b;
}
async function makeVideo(text,button){
 if(activeDialog)return;
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){alert('当前浏览器不支持视频录制，请使用新版 Chrome 或 Edge。');return;}
 const parts=scenesFrom(text);if(!parts.length){alert('这条回答没有足够的文字内容生成视频。');return;}
 const dialog=E('dialog','p2-video-dialog');activeDialog=dialog;
 const head=E('div','p2-video-head');head.append(E('div','p2-video-title','AI 复盘 · 字幕视频'),E('button','p2-video-close','关闭'));head.lastChild.type='button';head.lastChild.onclick=()=>{dialog.close();dialog.remove();activeDialog=null;};
 const hint=E('p','p2-video-hint','正在把回答转换为 16:9 动态字幕分镜。此版本生成无声 WebM，不会伪称已生成数字人配音。');
 const progress=E('progress','p2-video-progress');progress.max=parts.length;progress.value=0;
 const state=E('p','p2-video-state','准备生成…');const preview=E('video','p2-video-preview');preview.controls=true;preview.playsInline=true;
 const actions=E('div','p2-video-actions');const download=E('a','p2-video-download','下载视频');download.hidden=true;download.textContent='下载 WebM 视频';actions.append(download);
 dialog.append(head,hint,progress,state,preview,actions);document.body.append(dialog);dialog.showModal();
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
 const stream=canvas.captureStream(24);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
 let recorder,chunks=[],url='';
 try{
  recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:2400000}:{videoBitsPerSecond:2400000});
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(Error('浏览器录制失败'));});
  recorder.start(250);
  for(let i=0;i<parts.length;i++){
   const duration=2300,started=performance.now();
   await new Promise(resolve=>{function frame(now){const p=Math.min(1,(now-started)/duration);paint(ctx,canvas.width,canvas.height,parts[i],i,parts.length,p,String(parts[i].title||'AI 分析结果'));progress.value=i+1;state.textContent='正在生成第 '+(i+1)+' / '+parts.length+' 页…';if(p<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  }
  recorder.stop();await finished;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});if(!blob.size)throw Error('生成的视频文件为空');
  url=URL.createObjectURL(blob);preview.src=url;download.href=url;download.download='上岸鸭-AI复盘视频-'+new Date().toISOString().slice(0,10)+'.webm';download.hidden=false;
  state.textContent='生成完成：'+parts.length+' 个分镜，'+(blob.size/1024/1024).toFixed(2)+' MB。可预览或下载。';hint.textContent='已生成真实可播放的 WebM 文件。当前版本为动态字幕画面，不含配音；视频中的结论仍需核对原文。';
 }catch(e){try{if(recorder&&recorder.state!=='inactive')recorder.stop();}catch(_){}stream.getTracks().forEach(t=>t.stop());state.textContent='视频生成失败：'+e.message;hint.textContent='可以关闭后重试；浏览器可能不支持当前录制格式。';}
 dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);dialog.remove();activeDialog=null;});
}
window.P2VideoPresenter={createButton,scenesFrom,version:'1.0-canvas-webm'};
})();