global.window = {};
global.document = { addEventListener() {} };
global.setInterval = () => 0;
require("./autoloop.js");

const parsed = window.SYAutoloop.parseSchedule([
  "16:10-16:20 product decision analysis",
  "16:20-16:30 component make-or-buy analysis",
  "18:30-19:30 \u8ba8\u8bba agent \u9879\u76ee",
  "22:10-23:10 group review 11\u67082\u65e5 + 11\u67083\u65e5 + 11\u67084\u65e5",
  "23:45-24:00 \u6536\u5c3e\uff1a24:00\u51c6\u65f6\u7761\u89c9"
].join("\n"));
const today = new Date();
const expected = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
if (parsed.length !== 5) throw new Error("expected five time blocks, got "+parsed.length);
if (parsed.some(x => x.date !== expected)) throw new Error("title dates leaked into schedule date: "+JSON.stringify(parsed));
if (parsed[0].kind !== "scheduled") throw new Error("work block should remain movable");
if (parsed[2].kind !== "fixed") throw new Error("meeting should be fixed");
if (parsed[4].endMinutes !== 1440 || parsed[4].kind !== "fixed") throw new Error("24:00 sleep block not recognized");

const dated = window.SYAutoloop.parseSchedule([
  "\u672c\u5468\u4e34\u65f6\u5b89\u6392",
  "\u5148\u770b\u901a\u77e5",
  "\u4e0b\u65b9\u662f\u5177\u4f53\u65f6\u95f4",
  "2026-11-06",
  "08:30-09:30 \u6838\u5fc3\u8bfe\u7a0b\u7cbe\u8bb2"
].join("\n"));
if (dated.length !== 1 || dated[0].date !== "2026-11-06" || dated[0].kind !== "fixed") {
  throw new Error("standalone date line or course lock failed: "+JSON.stringify(dated));
}

const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate()+1);
const day = tomorrowDate.getFullYear()+"-"+String(tomorrowDate.getMonth()+1).padStart(2,"0")+"-"+String(tomorrowDate.getDate()).padStart(2,"0");
const day2Date = new Date(tomorrowDate); day2Date.setDate(day2Date.getDate()+1);
const day2 = day2Date.getFullYear()+"-"+String(day2Date.getMonth()+1).padStart(2,"0")+"-"+String(day2Date.getDate()).padStart(2,"0");
const plan = {tasks:[
  {id:"fixed",name:"class",date:day,startMinutes:540,endMinutes:600,plannedMinutes:60,aiScheduled:false,fixedBlock:true},
  {id:"movable",name:"study",date:day,startMinutes:540,plannedMinutes:60,aiScheduled:true,dueDate:day,taskType:"learning"},
  {id:"manual",name:"manual study block",date:day,startMinutes:540,plannedMinutes:45,aiScheduled:false,dueDate:day,taskType:"learning",order:2},
  {id:"ddl-soon",name:"deadline task",date:day2,startMinutes:null,plannedMinutes:30,aiScheduled:false,dueDate:day2,taskType:"learning"}
],dailyHours:{[day]:8,[day2]:8}};
const result = window.SYAutoloop.reflow(plan,day);
const fixed = plan.tasks.find(x=>x.id==="fixed");
const movable = plan.tasks.find(x=>x.id==="movable");
const manual = plan.tasks.find(x=>x.id==="manual");
const ddl = plan.tasks.find(x=>x.id==="ddl-soon");
if(fixed.startMinutes!==540)throw new Error("fixed event was moved");
if(movable.startMinutes<600 || movable.startMinutes<fixed.endMinutes)throw new Error("AI-scheduled task still overlaps fixed event");
if(manual.startMinutes<600 || manual.startMinutes<fixed.endMinutes)throw new Error("existing manually scheduled learning task was not made flexible");
if(ddl.date!==day || !Number.isFinite(ddl.startMinutes))throw new Error("task due within 3 days was not pulled forward");
if(result.warnings.length)throw new Error("unexpected reflow warnings: "+result.warnings.join(","));

const todayKey = expected;
const lateTask = {id:"late-new",name:"late new task",date:todayKey,startMinutes:null,plannedMinutes:40,createdAt:new Date(todayKey+"T16:00:00").getTime(),dueDate:day,taskType:"learning"};
const urgentTask = {id:"late-urgent",name:"urgent today",date:todayKey,startMinutes:null,plannedMinutes:25,createdAt:new Date(todayKey+"T16:00:00").getTime(),dueDate:todayKey,urgent:true,taskType:"learning"};
const latePlan = {tasks:[lateTask,urgentTask],dailyHours:{[todayKey]:8,[day]:8}};
window.SYAutoloop.reflow(latePlan,todayKey,18*60);
if(lateTask.date!==day || !Number.isFinite(lateTask.startMinutes))throw new Error("after-15:00 new non-urgent task was not deferred to tomorrow");
if(urgentTask.date!==todayKey || !Number.isFinite(urgentTask.startMinutes))throw new Error("urgent same-day DDL was incorrectly deferred");

if(lateTask.date!==day2 && lateTask.date!==day) throw new Error("late intake was moved outside the supported schedule horizon");
console.log(JSON.stringify({ok:true,parserRows:parsed.length,dateLine:dated[0].date,reflowMoved:result.moved,ddlTaskDate:ddl.date}));
