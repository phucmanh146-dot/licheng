'use strict';
const $=id=>document.getElementById(id);let projectId='';let timer=null;
async function json(url,options){const r=await fetch(url,options);const j=await r.json();if(!r.ok)throw Error(j.error||'请求失败');return j}
function e(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
function metric(label,value){const x=e('div');x.className='metric';x.append(e('strong',String(value)),document.createTextNode(' '+label));return x}
function render(board){
 $('metrics').replaceChildren(metric('窗口',board.windows.length),metric('执行中',board.counts.active),metric('卡住',board.counts.blocked),metric('未处理',board.counts.unhandled),metric('待复核',board.counts.waiting_review));
 const alerts=$('reminders');alerts.replaceChildren();for(const r of board.reminders){const x=e('div');x.className='reminder';x.append(e('strong',`${r.role} · ${r.status==='blocked'?'卡住':'未处理'}`),e('div',r.message));alerts.append(x)}if(!board.reminders.length)alerts.append(e('p','当前没有统一提醒。'));
 const host=$('board');host.replaceChildren();for(const w of board.windows){const c=e('article');c.className='cc '+w.status;c.append(e('span',w.source==='reported'?'● reported':'○ derived'));c.lastChild.className='tag';c.append(e('h3',w.label),e('p','窗口标识：'+w.window_id),e('p','阶段：'+w.stage),e('p','当前项：'+(w.current_item||'—')));if(w.blocker)c.append(e('p','卡点：'+w.blocker));const live=w.source==='reported'?(w.live?`心跳正常 · ${w.heartbeat_age_seconds}s 前`:`心跳过期 · ${w.heartbeat_age_seconds}s 前`):'尚未绑定真实 CC 心跳';const foot=e('p',live);foot.className='muted';c.append(foot);host.append(c)}
}
async function refreshProjects(){const state=await json('/api/agent/team');const ps=state.projects||[];$('projects').replaceChildren(...ps.map(p=>{const o=e('option',p.goal);o.value=p.project_id;return o}));const saved=localStorage.getItem('cc-board-project');const pick=ps.find(x=>x.project_id===projectId)||ps.find(x=>x.project_id===saved)||ps[0];if(pick){projectId=pick.project_id;$('projects').value=projectId;await refreshBoard()}}
async function refreshBoard(){if(!projectId)return;const board=await json('/api/agent/team/cc-board?id='+encodeURIComponent(projectId));render(board);localStorage.setItem('cc-board-project',projectId)}
$('projects').onchange=()=>{projectId=$('projects').value;refreshBoard().catch(console.error)};$('refresh').onclick=()=>refreshBoard().catch(e=>alert(e.message));
refreshProjects().catch(e=>{$('reminders').textContent='看板连接失败：'+e.message});timer=setInterval(()=>refreshBoard().catch(()=>{}),2000);window.addEventListener('beforeunload',()=>clearInterval(timer));
