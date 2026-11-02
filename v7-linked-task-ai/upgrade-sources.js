(function(){
  'use strict';
  const S=window.SY, e=x=>S.escapeHtml(String(x==null?'':x));
  let owner='',draft={},result=null,busy=false,message='',materials=[];
  function state(){
    if(owner!==S.currentAccountKey){owner=S.currentAccountKey; const a=S.getAcctData();draft=a.routeDraft||{};result=a.learningRoute||null;message='';materials=[];busy=false;}
    return draft;
  }
  function readForm(root){
    root=root||document;
    ['name','urls','sourceText','level','hours','category'].forEach(k=>{const el=root.querySelector('[data-route-field="'+k+'"]');if(el)draft[k]=el.value;});
    const search=root.querySelector('[data-route-field="search"]');if(search)draft.search=search.checked;
  }
  function save(){const a=S.getAcctData();a.routeDraft=Object.assign({},draft);if(result)a.learningRoute=result;else delete a.learningRoute;S.saveAcctData(a);}
  function payload(){return Object.assign({},draft,{urls:SYSourceIO.normalizeLinks(draft.urls),query:draft.name||''});}
  function redraw(){S.renderKnowledgeView();}
  const brands=[];
  S.skillPanelHtml=function(){
    state();const a=S.getAcctData();
    return '<section class="sy-route-builder" aria-label="资料航线工坊"><div class="sy-route-heading"><div><small>READ · TRACE · BUILD</small><h2>资料航线工坊</h2><p>带上自己整理的大纲，把每一步变成可完成的关卡。</p></div><span class="sy-route-orbit" aria-hidden="true">↗</span></div>'+
      '<div class="sy-route-brands">'+brands.map(b=>'<span class="mini-source-text"><img src="'+b[1]+'" width="20" height="20" alt="'+b[0]+' 标识">'+b[0]+'</span>').join('')+'</div>'+
      '<form id="syRouteForm"><div class="sy-route-fields"><label>想抵达什么成果<input data-route-field="name" maxlength="200" placeholder="例如：做出第一个能检索资料的 Agent" value="'+e(draft.name)+'"></label><label>目前进度<select data-route-field="level">'+['从零开始','有基础，缺实战','正在做，遇到卡点'].map(v=>'<option'+(draft.level===v?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>每周投入（小时）<input data-route-field="hours" type="number" min="1" max="60" value="'+e(draft.hours||8)+'"></label><label>放进哪个类别<select data-route-field="category">'+a.categories.map(c=>'<option'+(draft.category===c.name?' selected':'')+'>'+e(c.name)+'</option>').join('')+'</select></label></div>'+
      
      '<label>课程目录 / 飞书文档链接<textarea data-route-field="urls" rows="2" placeholder="粘贴课程总目录，按目录顺序读取；每一节课可以继续展开。">'+e(draft.urls)+'</textarea></label>'+
      '<label>课程 / 行动大纲（保留原来的层级和顺序）<textarea data-route-field="sourceText" rows="7" maxlength="80000" placeholder="第一节课：安装工具&#10;  1. 下载编辑器&#10;  2. 配置模型&#10;第二节课：创建项目">'+e(draft.sourceText)+'</textarea></label>'+
      
      '<p class="sy-route-footnote">一节课是一关，课内目录继续拆成小关。需要登录的飞书资料，可导出文档或把目录粘贴到这里。</p>'+
      '<div class="sy-route-buttons"><button class="btn btn-primary" type="submit"'+(busy?' disabled':'')+'>'+(busy?'正在读取目录…':'按目录建立分层路线')+'</button><button class="btn btn-ghost" id="syReadSources" type="button"'+(busy?' disabled':'')+'>读取并核对原文</button><button class="btn btn-ghost" id="syRouteImport" type="button">导入课程文档</button></div></form>'+
      '<div id="syRouteStatus" role="status" aria-live="polite">'+e(message).replace(/\n/g,'<br>')+'</div>'+
      (materials.length?'<details class="sy-route-materials"><summary>已读到 '+materials.length+' 份资料 · 查看正文</summary>'+materials.map(s=>'<article><strong>'+e(s.id)+' · '+e(s.title)+'</strong><p>'+e(s.scope)+(s.truncated?' · 资料过长，已明确截取前段':'')+'</p><pre>'+e(s.text.slice(0,2500))+'</pre></article>').join('')+'</details>':'')+
      renderResult(a)+'</section>';
  };
  function renderResult(a){
    if(!result||!Array.isArray(result.stages))return '';
    return '<section class="sy-route-result"><header><span>你的航线已展开</span><h3>'+e(result.skill)+'</h3><small>路线方式：'+e(result.model)+' · 来自我的大纲</small><button type="button" class="btn btn-primary" id="syRouteCreateAll">把整条路线加入清单</button></header><ol class="sy-route-islands">'+result.stages.map((s,i)=>{
      const exists=a.tasks.find(t=>t.routeStageKey===result.id+':'+i);
      return '<li class="sy-route-island"><div class="sy-route-island-top"><span class="sy-island-number">'+String(i+1).padStart(2,'0')+'</span><h4>'+e(s.name)+'</h4><span>'+s.minutes+' min</span></div><p class="sy-route-goal">抵达凭证：'+e(s.goal)+'</p><ol>'+s.steps.map(x=>'<li>'+e(x)+'</li>').join('')+'</ol><p class="sy-route-cites">来源 '+s.sourceIds.map(id=>{const source=(result.sources||[]).find(x=>x.id===id);return source&&source.url?'<span class="mini-source-text">'+e(id)+' · '+e(source.title)+'</span>':e(id)+' · 粘贴资料';}).join(' / ')+'</p><button type="button" class="btn btn-ghost" data-route-stage="'+i+'">'+(exists?'打开这关':'加入清单 · 准备登岛')+'</button></li>';
    }).join('')+'</ol><details><summary>资料与读取范围</summary>'+(result.sources||[]).map(s=>'<p><strong>'+e(s.id)+' '+e(s.title)+'</strong><br>'+e(s.scope)+'<br>'+e(s.excerpt||'')+'</p>').join('')+'</details></section>';
  }
  async function run(onlyRead){
    if(busy)return;readForm();
    const urls=payload().urls,ownerKey=S.currentAccountKey,sourceText=String(draft.sourceText||'').trim();
    if(!draft.name||!draft.name.trim()||(!sourceText&&!urls.length)){message='请写明成果，再粘贴课程链接或保留层级的目录。';redraw();return;}
    let nodes=sourceText?window.SYRouteOutline.parse(sourceText):[];
    materials=sourceText?[{id:'local-outline',title:draft.name,scope:'你提供的目录原文',text:sourceText}]:[];
    busy=true;message='正在读取并保留原目录顺序…';redraw();
    try{
      for(let i=0;i<Math.min(urls.length,12);i++){
        const response=await S.backendCall('/api/extract',{url:urls[i]},100000);
        if(ownerKey!==S.currentAccountKey)return;
        if(!response.ok||!response.data||response.data.thin)throw new Error(response.error||(response.data&&response.data.note)||'这个链接没有读到正文，请导出文档或粘贴目录。');
        const doc=response.data,parsed=SYRouteOutline.parse(doc.text,doc.outline);
        if(!parsed.length)throw new Error('读取到页面，但未找到可用目录。请补充左侧目录，不会用链接代替学习内容。');
        nodes=nodes.concat(parsed);materials.push({id:'source-'+i,title:doc.title,url:urls[i],scope:doc.outlineComplete===false?'目录可能不完整，请核对':'已读取到的正文目录',text:doc.text});
      }
      if(!nodes.length)throw new Error('没有读到目录。链接本身不能作为课程，请粘贴带标题的原文。');
      if(onlyRead){save();message='已读取 '+materials.length+' 份资料，识别 '+nodes.length+' 个目录项。请核对后建立路线。';return;}
      const sources=materials.map(s=>({id:s.id,title:s.title,url:s.url||'',scope:s.scope,excerpt:s.text.slice(0,1200)}));
      result={id:S.uid(),skill:draft.name,model:'原目录顺序 · 分层闯关',sources:sources,stages:nodes.map(node=>({name:node.title,goal:'完成这节课对应的内容与学习成果',minutes:25,steps:(node.children||[]).map(n=>n.title),children:node.children||[],sourceUrl:node.sourceUrl||'',material:node.material||'',sourceIds:sources.map(s=>s.id)}))};
      save();message='目录已展开为 '+nodes.length+' 关；点进某一关，再完成里面的小关。课程顺序与原文一致。';
    }catch(error){message=error.message;}finally{if(ownerKey===S.currentAccountKey){busy=false;redraw();}}
  }
  function createStage(i){
    const stage=result&&result.stages[i];if(!stage)return null;const a=S.getAcctData(),key=result.id+':'+i;
    const prior=a.tasks.find(t=>t.routeStageKey===key);if(prior)return prior;
    const task={id:S.uid(),name:stage.name,category:a.categories.some(c=>c.name===draft.category)?draft.category:a.categories[0].name,date:S.todayKey(),startMinutes:null,estMinutes:stage.minutes,plannedMinutes:stage.minutes,firstTime:false,multiplier:1,done:false,createdAt:Date.now(),order:a.tasks.reduce((m,t)=>Math.max(m,t.order||0),0)+1,weight:'heavy',important:true,taskType:'作品',routeStageKey:key,steps:S.makeSteps(stage.steps),noteFramework:stage.goal,noteKnowledge:'资料：\n'+(result.sources||[]).filter(s=>stage.sourceIds.includes(s.id)).map(s=>s.title+' '+s.url).join('\n')};
    function level(n,index,prefix){return {id:prefix+'-'+index,title:n.title,done:false,minutes:5,proof:'完成本节，留下可检查的结果',sourceUrl:n.sourceUrl||'',originUrl:n.originUrl||'',material:n.material||'',children:(n.children||[]).map((c,j)=>level(c,j,prefix+'-'+index))};}
    const course={title:stage.name,children:stage.children||[],sourceUrl:stage.sourceUrl,material:stage.material};
    const levels=[level(course,0,task.id)];
    task.steps=levels.map(n=>({id:n.id,text:n.title,done:false,children:n.children}));task.focusQuest={goal:stage.name,links:stage.sourceUrl||'',outline:'',levels:levels,path:levels[0].children.length?[0]:[],current:0};
    a.tasks.push(task);S.saveAcctData(a);S.renderSidebarCategoryList();return task;
  }
  S.bindSkillPanel=function(root){
    const form=root.querySelector('#syRouteForm');if(!form)return;
    form.addEventListener('submit',ev=>{ev.preventDefault();run(false);});
    form.addEventListener('input',()=>{readForm(root);});
    root.querySelector('#syReadSources').onclick=()=>run(true);
    root.querySelector('#syRouteImport').onclick=()=>{if(window.FocusQuest)FocusQuest.openForTask({name:draft.name||'按课程目录学习'});};
    root.querySelectorAll('[data-route-stage]').forEach(b=>b.onclick=()=>{const task=createStage(Number(b.dataset.routeStage));if(task)S.openQuest(task.id);});
    const all=root.querySelector('#syRouteCreateAll');if(all)all.onclick=()=>{result.stages.forEach((_,i)=>createStage(i));message='全部关卡已加入清单；重复点击不会重复创建。';redraw();};
    root.querySelectorAll('.sy-route-brands img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;},{once:true}));
  };
  
  window.SYSources={createStage,payload};
})();
