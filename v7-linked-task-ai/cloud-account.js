(function(){'use strict';
let account={authenticated:false},modal=null,launch=null;
const el=(tag,parent,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n};
async function request(path,data){const r=await fetch('/api/cloud-account/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||'账号请求未完成');return d}
function button(parent,text,fn){const b=el('button',parent,text);b.type='button';b.className='sywp-btn';b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){const s=modal?.querySelector('[data-account-status]');if(s)s.textContent=e.message}finally{b.disabled=false}};return b}
function field(parent,label,password=false){const l=el('label',parent,label),input=el('input',l);input.type=password?'password':'text';input.autocomplete=password?'current-password':'username';input.style.cssText='display:block;width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box';return input}
async function refresh(){account=await request('me');mount();return account}
async function open(){
await refresh();if(modal){modal.close();modal.remove()}
modal=el('dialog',document.body);modal.style.cssText='max-width:460px;width:calc(100% - 36px);border:1px solid #d7e5d7;border-radius:20px;padding:24px;background:#fffdf8;color:#30483b;font:15px system-ui';
el('h2',modal,account.authenticated?'我的工作台账号':'登录你的工作台');
const state=el('p',modal,'');state.dataset.accountStatus='';
button(modal,'关闭',()=>{modal.close();modal.remove();modal=null});
if(account.authenticated){
el('p',modal,'账号：'+account.name);
el('p',modal,account.authorizedSession?(account.serviceOnline?'已授权的读取服务在线；正文以实际查询结果为准。':'已保存微信授权，读取服务暂时离线。'):'此账号尚未取得微信资料读取授权。');
el('p',modal,'每个账号使用独立资料空间，登录后恢复该账号已保存的资料。');
const old=account.hasPassword?field(modal,'原密码',true):null;
const next=field(modal,account.hasPassword?'新密码（10至128个字符）':'设置登录密码，方便在其他设备登录',true);next.autocomplete='new-password';next.maxLength=128;
button(modal,'保存登录密码',async()=>{await request('password',{password:next.value,currentPassword:old?.value||''});next.value='';if(old)old.value='';state.textContent='登录密码已保存。';await refresh()});
button(modal,'退出账号',async()=>{await request('logout',{});await refresh();document.dispatchEvent(new Event('cloud:account-changed'));await open()});
}else{
el('p',modal,'登录后检索自己账号已授权的微信与知识资料。');
const name=field(modal,'账号名称'),password=field(modal,'密码（注册时至少10个字符）',true);name.maxLength=40;password.maxLength=128;
for(const [path,label] of [['login','登录'],['register','创建账号并登录']])button(modal,label,async()=>{
state.textContent='正在验证账号…';await request(path,{name:name.value.trim(),password:password.value});password.value='';await refresh();modal.close();modal.remove();modal=null;document.dispatchEvent(new Event('cloud:account-changed'));
});
}
modal.showModal();
}
function mount(){if(!launch){launch=el('button',document.body);launch.className='sywp-btn';launch.style.cssText='position:fixed;top:12px;right:16px;z-index:51000;background:#fffdf8;border:1px solid #c7d9c9;border-radius:12px;padding:9px 14px';launch.onclick=()=>open().catch(()=>{})}
launch.textContent=account.authenticated?'我的账号 · '+account.name:'登录 / 注册';}
window.SYCloudAuth={open,refresh,getAccount:()=>account};
window.addEventListener('focus',()=>refresh().catch(()=>{}));
refresh().catch(()=>{mount();launch.textContent='账号服务暂不可用';});
})();