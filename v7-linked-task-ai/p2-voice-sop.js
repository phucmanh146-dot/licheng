(function(){
'use strict';
const $=s=>document.querySelector(s);
const VOICE_KEY='sy_p2_voice_reply_v1';
let recognition=null,listening=false,lastAutoSpoken='',observer=null;
function status(text,bad){const n=$('#p2-status');if(n){n.textContent=text;n.classList.toggle('error',!!bad);}}
function add(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function promptFor(kind){
 const prompts={
  stuck:'我在做任务时遇到困难。请严格按“上岸鸭实操 SOP”带我排查：①先用一句话复述目标和当前卡点；②区分已知事实、推测和缺失信息；③先给最可能的 1—3 个原因及验证办法；④每次只给我一个可执行步骤，并说明预期结果；⑤等我反馈实际结果后再决定下一步；⑥如果失败，依据新证据调整，不要重复无效建议；⑦完成后总结根因、解决步骤、验证证据和复盘。不要假装操作成功，不要编造日志、截图或结果。我的当前情况是：',
  explain:'请把我上传的文档、Word、图片、视频或音频讲成零基础也能听懂的版本。先说明你实际读取到了什么、哪些部分没读到；再用生活化比喻解释核心概念；然后给出分步骤实操、一个真实可验证的小例子、常见错误和检查标准；最后用 3 道题检查我是否真的理解。',
  study:'请根据我上传的材料制定一份可执行的学习 SOP：目标、先修知识、分步操作、每步产出、验收标准、预计时间、常见错误、闯关题和复盘模板。保留原材料里的真实事实和链接，不要编造案例。',
  project:'请把我的想法转成可以落地的项目方案：用户问题、目标用户、核心流程、MVP、页面和交互、数据结构、API 清单、权限与隐私、失败处理、测试用例和上线验收。先给最小可行版本，再分阶段迭代。'
 };
 return prompts[kind]||prompts.stuck;
}
function speak(text){
 if(!('speechSynthesis' in window)||!window.SpeechSynthesisUtterance){status('当前浏览器不支持语音朗读。可尝试最新版 Chrome 或 Edge。',true);return;}
 const clean=String(text||'').replace(/https?:\/\/\S+/g,'链接').replace(/[#*_\[\]]/g,' ').replace(/\s+/g,' ').trim().slice(0,9000);
 if(!clean)return;
 speechSynthesis.cancel();
 const utter=new SpeechSynthesisUtterance(clean);utter.lang='zh-CN';utter.rate=0.98;utter.pitch=1;
 const voices=speechSynthesis.getVoices();const zh=voices.find(v=>/^zh(-|_)/i.test(v.lang));if(zh)utter.voice=zh;
 speechSynthesis.speak(utter);status('正在朗读回答。浏览器语音由本机/浏览器语音引擎提供。');
}
function voiceInput(btn){
 const C=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(recognition&&listening){recognition.stop();btn.textContent='🎙 语音提问';return;}
 if(!C){status('当前浏览器没有语音识别接口。可上传 MP3/WAV/M4A 音频，或直接输入文字。',true);return;}
 recognition=new C();recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;
 const box=$('#p2-text');let finalText='';
 recognition.onstart=()=>{listening=true;btn.textContent='■ 结束语音';status('正在听你说话；说完后会填入输入框，请检查文字再发送。');};
 recognition.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=text;else interim+=text;}box.value=(finalText+interim).trim();box.dispatchEvent(new Event('input',{bubbles:true}));};
 recognition.onerror=e=>status('语音识别未完成：'+e.error+'。请检查麦克风权限，或改用音频文件上传。',true);
 recognition.onend=()=>{listening=false;recognition=null;btn.textContent='🎙 语音提问';if(box.value.trim())status('语音已转成文字。核对内容后点击发送，避免识别错误。');};
 try{recognition.start();}catch(e){recognition=null;listening=false;btn.textContent='🎙 语音提问';status('无法启动麦克风：'+e.message,true);}
}
function addSopPanel(){
 const welcome=$('#p2-welcome');if(!welcome||$('#p2-sop-panel'))return;
 const panel=add('section','p2-sop-panel');panel.id='p2-sop-panel';
 const head=add('div','p2-sop-head');head.append(add('span','p2-sop-icon','🧭'));
 const title=add('div','');title.append(add('strong','', '中途卡壳？按 SOP 一步一步解决'),add('p','', '不是只给答案：先诊断，再做一步、验一步，直到问题真正解决。'));head.append(title);panel.append(head);
 const steps=add('ol','p2-sop-steps');
 ['说清目标和卡点','上传报错、文档、截图或录音','AI 区分事实、推测和未知','每次执行一个步骤并反馈结果','验证是否解决，必要时调整','沉淀成笔记、清单和下次可复用的 Skill'].forEach(s=>steps.append(add('li','',s)));
 panel.append(steps);
 const actions=add('div','p2-sop-actions');
 [['stuck','🧯 我遇到困难了'],['explain','📚 把材料讲明白'],['study','📝 生成学习计划'],['project','🛠 拆解项目实操']].forEach(([kind,label])=>{const b=add('button','p2-sop-action',label);b.type='button';b.addEventListener('click',()=>{const box=$('#p2-text');if(box){box.value=promptFor(kind);box.focus();box.dispatchEvent(new Event('input',{bubbles:true}));}});actions.append(b);});
 panel.append(actions);const prompts=$('.p2-prompts');if(prompts)prompts.insertAdjacentElement('afterend',panel);else welcome.append(panel);
}
function addControls(){
 const left=$('.p2-controls-left');if(!left||$('#p2-voice-input'))return;
 const mic=add('button','p2-link','🎙 语音提问');mic.type='button';mic.id='p2-voice-input';mic.title='用浏览器语音识别把问题转成文字';mic.addEventListener('click',()=>voiceInput(mic));
 const addUrl=$('#p2-add-url');if(addUrl)addUrl.insertAdjacentElement('beforebegin',mic);else left.append(mic);
 const label=add('label','p2-switch');label.title='开启后自动朗读新回答，也可点击单条回答旁的朗读按钮';
 const cb=add('input');cb.type='checkbox';cb.id='p2-voice-output';try{cb.checked=localStorage.getItem(VOICE_KEY)==='1';}catch(e){}
 cb.addEventListener('change',()=>{try{localStorage.setItem(VOICE_KEY,cb.checked?'1':'0');}catch(e){}if(!cb.checked&&window.speechSynthesis)speechSynthesis.cancel();});
 label.append(cb,add('span','','🔊 语音回答'));left.append(label);
 const file=$('#p2-files');if(file){file.accept+=',audio/*';}
}
function decorateAnswers(){
 const rows=[...document.querySelectorAll('#p2-messages .p2-message.assistant')];
 rows.forEach(row=>{if(row.querySelector('.p2-speak-one'))return;const bubble=row.querySelector('.p2-bubble');if(!bubble)return;
  const btn=add('button','p2-speak-one','🔊 朗读');btn.type='button';btn.title='朗读这条回答';btn.addEventListener('click',()=>speak(bubble.innerText||bubble.textContent||''));row.append(btn);
 });
 if($('#p2-voice-output')?.checked&&rows.length){const latest=rows[rows.length-1].querySelector('.p2-bubble');const text=latest?.innerText||latest?.textContent||'';if(text&&text!==lastAutoSpoken){lastAutoSpoken=text;speak(text);}}
}
function addDocsAndAudioConfig(){
 const dialog=$('#p2-config-dialog');if(!dialog||$('#p2-audio-config'))return;
 const actions=dialog.querySelector('.p2-dialog-actions');if(!actions)return;
 const docs=add('section','p2-doc-links');docs.id='p2-doc-links';docs.append(add('strong','', '多模态与架构官方文档'));
 const links=[
  ['StratSapien：Agent / RAG / LLM 应用架构','https://ai.stratsapien.com/'],
  ['OpenAI：音频 API','https://platform.openai.com/docs/api-reference/audio'],
  ['Google Gemini：音频理解','https://ai.google.dev/gemini-api/docs/audio'],
  ['Google Gemini：视频理解','https://ai.google.dev/gemini-api/docs/video-understanding'],
  ['Anthropic Claude：图片理解','https://docs.anthropic.com/zh-CN/docs/build-with-claude/vision']
 ];
 const list=add('div','p2-doc-list');links.forEach(([label,url])=>{const a=add('a','',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';list.append(a);});docs.append(list);actions.insertAdjacentElement('afterend',docs);
 const section=add('section','p2-audio-config');section.id='p2-audio-config';section.append(add('strong','', '语音文件转写（单独配置）'),add('p','', '上传 MP3/WAV/M4A 后会自动尝试转写。这里使用 OpenAI 官方转写接口；不配置时会尝试本机识别。语音 Key 与聊天模型 Key 分开保存。'));
 const modelLabel=add('label','p2-audio-label','转写模型');const model=add('select');model.id='p2-audio-model';
 [['gpt-4o-mini-transcribe','gpt-4o-mini-transcribe（经济）'],['gpt-4o-transcribe','gpt-4o-transcribe（高质量）'],['whisper-1','whisper-1']].forEach(([v,t])=>{const o=add('option','',t);o.value=v;model.append(o);});modelLabel.append(model);
 const keyLabel=add('label','p2-audio-label','语音转写 API Key');const key=add('input');key.type='password';key.id='p2-audio-key';key.autocomplete='new-password';key.placeholder='sk-…（只发给当前会话后端）';keyLabel.append(key);
 const save=add('button','p2-audio-save','保存语音配置');save.type='button';save.id='p2-audio-save';
 const state=add('p','p2-audio-status','正在读取语音转写状态…');state.id='p2-audio-status';
 save.addEventListener('click',async()=>{save.disabled=true;state.textContent='正在保存配置…';try{const data={base:'https://api.openai.com/v1',model:model.value,key:key.value.trim(),enabled:true};const r=await P2App.api('/api/pm/transcribe-config',data,15000);key.value='';state.textContent=r.apiConfigured?'语音转写 API 已配置；上传音频后才会验证实际可用性。':r.configured?'本机语音识别可用；未保存新的 API Key。':'已保存配置，但语音转写尚未验证。';}catch(e){state.textContent='保存失败：'+e.message;}finally{save.disabled=false;}});
 section.append(modelLabel,keyLabel,save,state);docs.insertAdjacentElement('afterend',section);
 const open=$('#p2-open-config');if(open)open.addEventListener('click',()=>loadAudioConfig());
}
async function loadAudioConfig(){const state=$('#p2-audio-status'),model=$('#p2-audio-model');if(!state||!model)return;state.textContent='正在读取语音转写状态…';try{const r=await P2App.api('/api/pm/status',undefined,12000);const t=r.transcription||{};if(t.model)model.value=t.model;state.textContent=t.apiConfigured?'语音转写 API 已配置（密钥不会回显）。':t.local?.available?'本机语音识别已就绪，无需额外 Key。':'尚未配置语音转写 API；上传音频会尝试本机识别，失败时会显示原因。';}catch(e){state.textContent='读取状态失败：'+e.message;}}
function init(){
 addControls();addSopPanel();addDocsAndAudioConfig();
 const messages=$('#p2-messages');if(messages&&!observer){observer=new MutationObserver(()=>{decorateAnswers();});observer.observe(messages,{childList:true,subtree:true});}
 decorateAnswers();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
