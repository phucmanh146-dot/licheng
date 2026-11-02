(() => {
  if (document.getElementById('duck-learning-agent-entry')) return;
  const a = document.createElement('a');
  a.id = 'duck-learning-agent-entry';
  a.href = 'http://127.0.0.1:8901/learning-agent.html';
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = '学习导航 Agent ↗';
  a.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9000;background:#176b56;color:white;padding:12px 18px;border-radius:28px;font:600 13px Microsoft YaHei,sans-serif;text-decoration:none;box-shadow:0 4px 18px #183e3530';
  document.body.append(a);
})();
