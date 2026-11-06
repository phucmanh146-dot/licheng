async function sendEvidence(payload) {
  const cfg = await chrome.storage.local.get(["cloudUrl","token","bridgeEnabled","taskId"]);
  if (!cfg.bridgeEnabled || !cfg.cloudUrl || !cfg.token) {
    return {ok:false,error:"请先在扩展中配置云端地址和令牌并启用采集"};
  }
  if (!payload.task_id && cfg.taskId) payload.task_id = cfg.taskId;
  const base = cfg.cloudUrl.replace(/\/+$/,"");
  const response = await fetch(base + "/api/v1/hub/evidence", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+cfg.token},
    body:JSON.stringify(payload)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || ("HTTP "+response.status));
  return {ok:true,data};
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if (!message || !["cloud-hub-evidence","cloud-hub-screenshot"].includes(message.type)) return;
  sendEvidence(message.payload).then(sendResponse).catch(e=>sendResponse({ok:false,error:String(e)}));
  return true;
});