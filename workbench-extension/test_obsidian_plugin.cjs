// Plugin API fixtures. Real Obsidian installation is a separate acceptance step.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class TFile{constructor(path){this.path=path;}}
const source=fs.readFileSync(path.join(__dirname,'obsidian-bridge/main.js'),'utf8');
const timers=[];
const context={module:{exports:{}},require:id=>id==='obsidian'?{Plugin:class{},TFile,Notice:class{},requestUrl:()=>{throw Error('no network in tests');}}:id==='timers'?{
 setInterval:(callback,ms)=>{const timer={callback,ms,cleared:false};timers.push(timer);return timer;},clearInterval:timer=>{timer.cleared=true;}
}:require(id)};
vm.runInNewContext(source,context);
(async()=>{
 const plugin=new context.module.exports(),files=new Map([['学习/笔记.md',new TFile('学习/笔记.md')]]),writes=[];
 plugin.app={vault:{getAbstractFileByPath:p=>files.get(p),read:async()=> '实际文件正文 fixture',createFolder:async p=>files.set(p,{}),create:async(p,c)=>{writes.push({p,c});const f=new TFile(p);files.set(p,f);return f;}},workspace:{getLeaf:()=>({openFile:async()=>{}})}};
 assert.equal((await plugin.execute({id:'a'.repeat(32),action:'read',path:'学习/笔记.md'})).content,'实际文件正文 fixture');
 for(const p of ['../secret.md','.obsidian/config.md','C:/secret.md'])await assert.rejects(()=>plugin.execute({id:'a'.repeat(32),action:'read',path:p}));
 const job={id:'b'.repeat(32),action:'save',title:'../../产品:计划',content:'# 内容'};
 await plugin.execute(job);await plugin.execute(job);
 assert.equal(writes.length,1,'same save request does not overwrite or duplicate');
 assert.ok(writes[0].p.startsWith('上岸鸭输出/'));assert.ok(!writes[0].p.includes('/../'));
 const cleanup=[];
 Object.assign(plugin,{loadData:async()=>({vaultId:'fixture',recent:[]}),saveData:async()=>{},registerObsidianProtocolHandler:()=>{},registerEvent:()=>{},register:fn=>cleanup.push(fn)});
 Object.assign(plugin.app.workspace,{on:()=>{},onLayoutReady:()=>{}});
 await plugin.onload();
 assert.equal(timers.length,1);assert.equal(timers[0].ms,1500,'desktop heartbeat uses Node timer without any window timer');
 cleanup.forEach(fn=>fn());assert.ok(timers[0].cleared,'plugin unload cancels heartbeat');
 console.log('PASS: actual Vault read contract, traversal rejection, create-only/idempotent save, background heartbeat lifecycle');
})().catch(e=>{console.error(e);process.exitCode=1;});
