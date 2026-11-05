(() => {
  "use strict";
  if (window.__shanganyaCloudEvidenceBridge) return;
  window.__shanganyaCloudEvidenceBridge = true;
  const host = location.hostname.toLowerCase();
  let source = "";
  if (host === "chatgpt.com" || host === "chat.openai.com") source = "chatgpt";
  else if (host === "trae.cn" || host.endsWith(".trae.cn") || host === "trae.ai" || host.endsWith(".trae.ai")) source = "trae";
  else if (host === "doubao.com" || host.endsWith(".doubao.com")) source = "doubao";
  if (!source) return;
  let timer = null, lastDigest = "";
  function hash(text) {
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(16);
  }
  function capture() {
    timer=null;
    chrome.storage.local.get(["bridgeEnabled"],cfg=>{
      if(!cfg.bridgeEnabled)return;
      const main=document.querySelector("main,[role='main']")||document.body;
      const nodes=main.querySelectorAll("[data-message-author-role],[data-testid*='conversation-turn'],article");
      const text=(nodes.length?Array.from(nodes).slice(-12).map(n=>(n.innerText||"").trim()).filter(Boolean).join("\n\n"):(main.innerText||"").trim()).slice(-6000);
      if(text.length<80)return;
      const digest=hash(source+"|"+location.pathname+"|"+text);
      if(digest===lastDigest)return;
      lastDigest=digest;
      chrome.runtime.sendMessage({type:"cloud-hub-evidence",payload:{
        source,conversation_id:source+":"+location.pathname,
        page_url:location.href.slice(0,2048),page_title:(document.title||source).slice(0,300),
        text,observed_at:new Date().toISOString()
      }},()=>{void chrome.runtime.lastError});
    });
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(capture,6000)}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  schedule();
  window.addEventListener("pagehide",()=>observer.disconnect(),{once:true});
})();