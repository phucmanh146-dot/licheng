(function () {
  'use strict';
  var S = window.SY; if (!S) return;
  function captainHtml() {
    return '<div class="voyage-captain" aria-hidden="true"><svg viewBox="0 0 240 240" fill="none"><ellipse cx="120" cy="222" rx="73" ry="10" fill="#234a40" opacity=".15"/><path d="M52 171c-4-55 31-83 68-83s74 31 68 84l-8 34H60Z" fill="#ffc962" stroke="#385a44" stroke-width="4"/><path d="M74 166 45 150l-11 14 38 34m94-33 33-20 13 13-36 38" fill="#ffc962" stroke="#385a44" stroke-width="4" stroke-linejoin="round"/><circle cx="120" cy="93" r="58" fill="#ffda79" stroke="#385a44" stroke-width="4"/><path d="M68 65 65 40Q120 6 176 40l-5 26Z" fill="#fcf9e9" stroke="#385a44" stroke-width="4"/><path d="M66 61q56-20 108 0l-7 13q-51-14-93 0Z" fill="#345d4e"/><circle cx="121" cy="41" r="12" fill="#e7bd58"/><path d="M121 34v15m-6-7q6 11 12 0m-10-8h8" stroke="#345d4e" stroke-width="2" stroke-linecap="round"/><path d="M91 88v10m59-10v10" stroke="#294d40" stroke-width="7" stroke-linecap="round"/><ellipse cx="121" cy="117" rx="24" ry="12" fill="#eb874b" stroke="#385a44" stroke-width="3"/><path d="M99 118h42" stroke="#ad5d35" stroke-width="2"/><path d="m79 152 29 15v43H65Zm85 0-31 15v43h43Z" fill="#ec956b" stroke="#385a44" stroke-width="4"/><path d="M108 176h25m-25 18h25" stroke="#385a44" stroke-width="4"/><path d="M71 216h32m34 0h34" stroke="#e49950" stroke-width="10" stroke-linecap="round"/></svg><span>阿岸船长 · 陪你走这一关</span></div>';
  }
  function seascape() {
    return '<svg class="voyage-window" viewBox="0 0 1200 290" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1200" height="290" fill="#cde0d0"/><circle cx="850" cy="90" r="55" fill="#ffe2a0"/><path d="M0 180q150-60 300 0t300 0t300 0t300 0v110H0Z" fill="#6baf9d"/><path d="M0 212q140-35 300 0t300 0t300 0t300 0v78H0Z" fill="#468c7d"/><path d="M0 259q150-34 300 0t300 0t300 0t300 0v31H0Z" fill="#367166"/><path d="M815 175q65-60 154 0" fill="#597f63"/><path d="m875 151 8-75h18l9 75" fill="#fff5d9"/><path d="M881 86h22v20h-22m-3 18h30v15h-30" fill="#d7815c"/><path d="M878 77h28l-14-15Z" fill="#3a6552"/><path d="M80 70q14-14 28 0 14-14 28 0m210 20q14-14 28 0 14-14 28 0" stroke="#819e85" stroke-width="3" stroke-linecap="round"/><path d="M1010 36v254M400 0v290" stroke="#31594b" stroke-width="14" opacity=".22"/><path d="M0 285h1200" stroke="#e2c18b" stroke-width="18"/></svg>';
  }
  function decorate() {
    var stage = document.querySelector('#pomodoroBody .pomo-stage');
    if (!stage || !stage.querySelector('.pomo-voyage-screen') || stage.classList.contains('voyage-stage')) return;
    stage.classList.add('voyage-stage');
    var title = document.createElement('div'); title.className = 'voyage-panorama';
    title.innerHTML = DOMPurify.sanitize(seascape() + '<div class="voyage-heading"><span>专注航程 / FOCUS VOYAGE</span><h2>现在，只航向这一件事。</h2><p>你掌舵。重要的事，我们一起记着。</p></div>' + captainHtml());
    var grid = document.createElement('div'); grid.className = 'voyage-workspace';
    var console = document.createElement('div'); console.className = 'voyage-console';
    var crew = document.createElement('div'); crew.className = 'voyage-crew';
    Array.from(stage.children).forEach(function (el) {
      if (el.matches('[data-sy-focus],.hourglass-widget')) crew.appendChild(el); else console.appendChild(el);
    });
    var a=S.getAcctData(),task=(a.tasks||[]).find(function(t){return a.activeTimer&&t.id===a.activeTimer.taskId;});
    var next=task&&(task.steps||[]).find(function(s){return !s.done;});
    var route=document.createElement('section');route.className='voyage-next-action';
    var heading=document.createElement('h3');heading.textContent='下一步，先做到这里';
    var action=document.createElement('p');action.textContent=next?next.text:'把资料带进来，拆成一关一关的小动作。';
    var routeButton=document.createElement('button');routeButton.textContent='打开资料航线 →';routeButton.type='button';
    routeButton.onclick=function(){if(window.FocusQuest)FocusQuest.openForTask(task);};
    route.append(heading,action,routeButton);console.appendChild(route);
    var cameraPanel = crew.querySelector('[data-sy-focus]'); if (cameraPanel) crew.prepend(cameraPanel);
    grid.append(console, crew); stage.append(title, grid);
  }
  var original = S.renderPomodoroView;
  S.renderPomodoroView = function () { var value = original.apply(this, arguments); decorate(); return value; };
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-sy-receipt],[data-cat]')) return;
    setTimeout(function () {
      var paper = document.getElementById('receiptPaper');
      if (paper && paper.getBoundingClientRect().width) { paper.classList.remove('voyage-printing'); void paper.offsetWidth; paper.classList.add('voyage-printing'); }
    }, 0);
  });
  window.SYVoyage = { captainHtml: captainHtml, decorate: decorate };
  decorate();
})();
