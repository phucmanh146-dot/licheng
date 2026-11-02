export const labels={todo:"待认领",in_progress:"进行中",blocked:"受阻",review:"待验收",passed:"已验收"};
export const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function parseIssue(issue){
 if(!issue)return {status:"todo",evidence:"",missing:true};
 const body=issue.body||"";
 const raw=body.match(/^状态[：:]\s*(.+)$/m)?.[1]?.trim();
 const evidence=body.match(/^验收证据[：:]\s*(https?:\/\/\S+)/m)?.[1]||"";
 const map={"待认领":"todo","进行中":"in_progress","受阻":"blocked","待验收":"review","已验收":"passed"};
 let status=map[raw]||"todo";
 if(status==="passed"&&!evidence)status="review";
 if(issue.state==="closed"&&status!=="passed")status="review";
 return {status,evidence,missing:false};
}
export function taskStates(data,issues=null){return Object.fromEntries(data.tasks.map(t=>[t.id,issues?parseIssue(issues.find(i=>(i.number??i.issue_number)===t.issue.number)):{status:"todo",evidence:"",missing:false}]));}
export const dependenciesMet=(task,states)=>task.dependsOn.every(id=>states[id]?.status==="passed");
export function filterTasks(tasks,states,{query="",owner="",status=""}={}){const q=query.trim().toLocaleLowerCase();return tasks.filter(t=>(!q||[t.id,t.title,t.delta,...t.deliverables,...t.acceptance].join(" ").toLocaleLowerCase().includes(q))&&(!owner||t.lead===owner)&&(!status||states[t.id]?.status===status));}
export function taskMarkdown(t,state){return "## "+t.id+" "+t.title+"\n\n建议主责："+t.owner+"\n状态："+labels[state.status]+"\n前置："+(t.dependsOn.join("、")||"无")+"\n\n已有基础："+t.baseline+"\n\n本次新增："+t.delta+"\n\n交付物：\n"+t.deliverables.map(v=>"- "+v).join("\n")+"\n\n验收条件：\n"+t.acceptance.map(v=>"- [ ] "+v).join("\n")+"\n\n验收证据：\n"+t.evidence.map(v=>"- "+v).join("\n")+"\n\nGitHub："+t.issue.url+"\n";}
