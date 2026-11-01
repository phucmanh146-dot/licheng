(function(root){
'use strict';
if(root.SYAcceptanceEngine&&root.SYAcceptanceEngine.version==='2026-11-01-rubric-v1')return;
var VERSION='2026-11-01-rubric-v1',host=null,observer=null;
function acct(){try{return root.SY&&SY.getAcctData?SY.getAcctData():null}catch(e){return null}}
function save(a){try{return !!(root.SY&&SY.saveAcctData&&SY.saveAcctData(a))}catch(e){return false}}
function tasks(a){return a&&Array.isArray(a.tasks)?a.tasks:[]}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function classify(t){
 var s=((t.name||'')+' '+(t.project||'')+' '+(t.category||'')+' '+(t.deliverable||'')).toLowerCase();
 if(/ppt|演示文稿|幻灯片|汇报/.test(s))return'ppt';
 if(/课程|听课|学习|考研|训练营|教程/.test(s))return'course';
 if(/代码|开发|agent|demo|网页|功能|接口/.test(s))return'code';
 if(/发布|回填|数据/.test(s))return'publish';
 if(/拍摄|录屏|剪辑|成片|视频制作/.test(s))return'video';
 if(/脚本|标题|分镜|文案/.test(s))return'script';
 if(/资料|选题|研究|检索/.test(s))return'research';
 if(/合规|检查|审核/.test(s))return'compliance';
 return'general';
}
var RUBRICS={
 research:{name:'资料与选题',items:[['来源可追溯',5,'提供原始来源链接或原始文件'],['正文真实读取',5,'提供实际读取的正文/截图，不以链接代替正文'],['关键事实核验',5,'至少核对关键事实与来源一致'],['选题匹配目标',5,'说明受众、问题与选题之间的对应关系']]},
 script:{name:'脚本与分镜',items:[['受众与目标明确',4,'明确目标受众和希望解决的问题'],['开头有效',4,'前3秒有明确主题/问题/利益点'],['内容完整准确',4,'核心信息完整，无无来源事实'],['分镜可执行',4,'画面、口播/字幕与镜头顺序明确'],['标题与内容一致',4,'标题不夸大、不误导，和成片一致']]},
 video:{name:'拍摄与剪辑',items:[['成片文件可打开',6,'提供真实视频文件，能正常播放'],['画幅与画面',6,'符合任务要求的比例，主体清晰无遮挡'],['声音与口播',6,'人声清楚，无明显爆音/静音/错配'],['字幕准确',6,'字幕与语音一致，不断句、不遮挡重点'],['内容真实性与完整性',6,'画面确实展示所声称的操作/内容，无虚构演示']]},
 compliance:{name:'发布前质量与合规',items:[['事实准确',5,'画面、字幕、文案中的事实有依据'],['原创与授权',5,'素材有权使用，不冒充真实操作或他人作品'],['平台规范与表达',5,'标题、封面、内容无明显违规/误导']]},
 publish:{name:'发布与数据回填',items:[['真实作品链接',5,'公开作品链接可打开且对应本次作品'],['后台数据凭证',5,'提供创作者中心数据截图/导出凭证'],['数据字段完整',5,'播放、互动等数据标注采集时间，不用猜测值']]},
 ppt:{name:'PPT交付评分',items:[['任务要求覆盖',20,'逐条对应任务书/评分标准，不漏必答项'],['逻辑结构',20,'结构完整、论点连贯、结论可追溯'],['内容与证据',25,'关键结论有数据/案例/来源支撑'],['表达与视觉',20,'图表清晰、文字可读、页面层级统一'],['交付规范',15,'页数/格式/命名/引用/提交文件符合要求']]},
 course:{name:'课程学习验收',items:[['课程进度证据',20,'提供平台章节进度/学习记录；无平台记录标待核验'],['知识点理解',25,'能用自己的话解释核心概念'],['独立测试',35,'完成系统根据课程内容生成的题目并按答案评分'],['迁移应用',20,'能把知识点用于一道新题/实际任务']]},
 code:{name:'代码与功能验收',items:[['代码/版本证据',15,'提供提交记录、文件或版本差异'],['功能逐项实现',25,'每项需求均对应可复现的操作结果'],['运行验证',25,'提供真实运行截图/录屏或可访问部署'],['异常与边界测试',20,'覆盖错误输入、空数据、失败路径'],['回归与交付',15,'无阻断问题，说明已知限制和启动方式']]},
 general:{name:'通用交付验收',items:[['交付物存在且可打开',20,'提供实际文件/作品/记录'],['要求覆盖',30,'逐条对照原始要求'],['内容质量',25,'准确、完整、逻辑清晰'],['交付规范',15,'格式、命名、路径符合要求'],['证据可追溯',10,'提供来源、版本或提交凭证']]}
};
function getRubric(t){var k=classify(t);return{type:k,rubric:RUBRICS[k]||RUBRICS.general}}
function render(){
 var a=acct(),panel=document.getElementById('sdpm-center');if(!a||!panel)return;
 var all=tasks(a).filter(function(t){return t&&(/^douyin_/.test(String(t.importKey||''))||String(t.project||'').indexOf('抖音')>=0||/ppt|课程|考研|agent|demo/i.test(String(t.name||'')))});
 var selected=host&&host.querySelector('[data-ae-task]')?host.querySelector('[data-ae-task]').value:'';
 if(!selected&&all.length)selected=String(all[0].id);
 var t=all.find(function(x){return String(x.id)===String(selected)})||all[0],existing=t&&a.acceptanceRecords&&a.acceptanceRecords[String(t.id)],cfg=t?getRubric(t):null;
 if(!host){host=document.createElement('section');host.id='sy-acceptance-engine';host.className='sy-ae';panel.appendChild(host)}
 if(!t){host.innerHTML='<h3>05 · 标准化验收与评分</h3><p>当前没有可验收任务。先生成今天的运营步骤，系统会按任务类型匹配固定评分表。</p>';return}
 var score=0,total=cfg.rubric.items.reduce(function(s,x){return s+x[1]},0),rows=cfg.rubric.items.map(function(it,i){var v=existing&&existing.items&&existing.items[i]||{},level=Number(v.level||0),ev=v.evidence||'',pts=level===2?it[1]:level===1?it[1]/2:0;if(ev.trim())score+=pts;return '<div class="ae-row"><div class="ae-row-head"><b>'+esc(it[0])+'</b><strong>'+it[1]+'分</strong></div><p>'+esc(it[2])+'</p><div class="ae-controls"><select data-ae-level="'+i+'"><option value="0" '+(level===0?'selected':'')+'>未通过 / 无证据（0分）</option><option value="1" '+(level===1?'selected':'')+'>部分符合（50%）</option><option value="2" '+(level===2?'selected':'')+'>符合（100%）</option></select><input data-ae-evidence="'+i+'" value="'+esc(ev)+'" placeholder="证据位置/链接/文件名/检查结果（必填才计分）"></div></div>'}).join('');
 var pct=Math.round(score/total*100),hasRecord=!!existing;
 host.innerHTML='<div class="ae-head"><div><small>FIXED RUBRIC · VERSION '+VERSION+'</small><h3>05 · 标准化验收与评分</h3><p>同一任务类型使用同一份评分细则；分值固定，证据不足不计分。点击“完成”不等于验收通过。</p></div><span class="ae-score">'+(hasRecord?score:0)+'<small>/ '+total+' 分</small></span></div><label class="ae-task-label">选择待验收任务<select data-ae-task>'+all.map(function(x){return '<option value="'+esc(x.id)+'" '+(String(x.id)===String(t.id)?'selected':'')+'>'+esc(x.name)+'</option>'}).join('')+'</select></label><div class="ae-rubric-title"><b>'+esc(cfg.rubric.name)+'</b><span>'+esc(cfg.type.toUpperCase())+' · 固定权重</span></div><div class="ae-progress"><i style="width:'+(hasRecord?pct:0)+'%"></i></div><div class="ae-items">'+rows+'</div><div class="ae-actions"><button type="button" data-ae-save>保存本次评分</button><button type="button" data-ae-clear>清除此项评分</button></div><div class="ae-result">'+(hasRecord?('当前证据评分：'+score+'/'+total+'（'+pct+'%）。'+(existing.status==='passed'?'验收通过。':existing.status==='partial'?'部分通过，需按缺项返工。':'未通过或证据不足。')):'尚未验收。没有评分记录不会自动视为完成。')+'</div><p class="ae-disclaimer">评分规则版本固定为 '+VERSION+'。本地勾选/自填证据属于待核验材料，不等于独立验证。课程播放记录需平台接口或真实学习记录；文件内容需实际读取；发布数据需平台凭证。当前页面不具备摄像头/脑波/全程屏幕监控能力，不会假称检测到真实行为。</p>';
 host.querySelector('[data-ae-task]').addEventListener('change',render);
 host.querySelector('[data-ae-save]').addEventListener('click',function(){var a0=acct();if(!a0)return;var id=String(t.id),items=cfg.rubric.items.map(function(it,i){var level=Number(host.querySelector('[data-ae-level="'+i+'"]').value||0),evidence=host.querySelector('[data-ae-evidence="'+i+'"]').value.trim();return{criterion:it[0],max:it[1],level:level,evidence:evidence,points:evidence?(level===2?it[1]:level===1?it[1]/2:0):0}});var earned=items.reduce(function(s,x){return s+x.points},0),sum=items.reduce(function(s,x){return s+x.max},0),allEvidence=items.every(function(x){return !!x.evidence}),pass=allEvidence&&earned>=sum*.8;a0.acceptanceRecords=a0.acceptanceRecords||{};a0.acceptanceRecords[id]={taskId:id,taskName:t.name,type:cfg.type,rubricVersion:VERSION,items:items,score:earned,maxScore:sum,percent:Math.round(earned/sum*100),status:pass?'passed':earned>0?'partial':'failed',evidenceComplete:allEvidence,reviewedAt:Date.now(),reviewMode:'固定量表记录；证据真实性仍需独立核验'};save(a0);render();if(root.SY&&SY.refreshCurrentView)SY.refreshCurrentView()});
 host.querySelector('[data-ae-clear]').addEventListener('click',function(){var a0=acct();if(!a0||!a0.acceptanceRecords)return;delete a0.acceptanceRecords[String(t.id)];save(a0);render()});
}
function boot(){render();if(!observer&&document.body){observer=new MutationObserver(function(){if(!document.getElementById('sy-acceptance-engine')){host=null;render()}});observer.observe(document.body,{childList:true,subtree:true})}}
var n=0,timer=setInterval(function(){n++;if(document.getElementById('sdpm-center')){clearInterval(timer);boot()}else if(n>120)clearInterval(timer)},500);
document.addEventListener('sy:ready',boot);root.SYAcceptanceEngine={version:VERSION,render:render,classify:classify,rubrics:RUBRICS};
})(window);