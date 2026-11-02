/* Desktop-only Obsidian plugin. No arbitrary shell commands or folder scanning. */
const { Plugin, Notice, TFile, requestUrl } = require('obsidian');
const { randomBytes } = require('crypto');
const { setInterval: heartbeatInterval, clearInterval: clearHeartbeat } = require('timers');
const BASE = 'http://127.0.0.1:8877/api/obsidian-bridge';
const safePath = path => typeof path === 'string' && path.endsWith('.md') && !/[\\:]/.test(path)
  && path.split('/').every(p => p && !p.startsWith('.'));

module.exports = class ShanganyaBridge extends Plugin {
  async onload() {
    this.data = Object.assign({vaultId: randomBytes(16).toString('hex'), recent: []}, await this.loadData());
    this.outbox = new Map(); this.running = false; this.stopped = false;
    this.registerObsidianProtocolHandler('shanganya-connect', async ({code}) => {
      if (!/^[A-Za-z0-9_-]{40,80}$/.test(code || '')) return new Notice('请从上岸鸭工作台发起连接。');
      try {
        const response = await requestUrl({url: BASE + '/register', method: 'POST', contentType: 'application/json', body: JSON.stringify({code, vaultId: this.data.vaultId})});
        if (!response.json.token) throw Error('未收到连接凭证');
        this.data.token = response.json.token; await this.saveData(this.data);
        new Notice('已连接上岸鸭。双击最近笔记可导入正文。'); await this.tick();
      } catch (_) { new Notice('连接未完成。请启动电脑上的上岸鸭资料行动，再从工作台重新连接。'); }
    });
    this.registerEvent(this.app.workspace.on('file-open', file => this.touch(file)));
    this.app.workspace.onLayoutReady(() => { this.touch(this.app.workspace.getActiveFile()); this.tick(); });
    // Chromium throttles window timers when the user works in WeChat. Node's
    // timer keeps this desktop-only connection responsive in the background.
    const heartbeat = heartbeatInterval(() => this.tick(), 1500);
    this.register(() => clearHeartbeat(heartbeat));
  }
  async touch(file) {
    if (!(file instanceof TFile) || !safePath(file.path)) return;
    this.data.recent = [file.path, ...this.data.recent.filter(p => p !== file.path)].slice(0, 20);
    await this.saveData(this.data);
  }
  async execute(job) {
    if (!/^[a-f0-9]{32}$/.test(job.id || '')) throw Error('请求编号无效');
    if (job.action === 'read') {
      if (!safePath(job.path)) throw Error('只支持当前库内的 Markdown 笔记');
      const file = this.app.vault.getAbstractFileByPath(job.path);
      if (!(file instanceof TFile)) throw Error('笔记已移动或删除，请刷新列表');
      const content = await this.app.vault.read(file);
      if (!content.trim() || content.length > 30000) throw Error('笔记为空或超过30000字，请分章节导入');
      return {content};
    }
    if (job.action === 'save') {
      if (typeof job.content !== 'string' || !job.content.trim() || job.content.length > 60000) throw Error('输出正文无效');
      const title = String(job.title || '产品分析').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^\.+/, '').slice(0, 70) || '产品分析';
      const folder = '上岸鸭输出';
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      const path = folder + '/' + title + '-' + job.id + '.md';
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) file = await this.app.vault.create(path, job.content);
      if (!(file instanceof TFile)) throw Error('输出路径不可用');
      await this.app.workspace.getLeaf(false).openFile(file);
      return {path};
    }
    throw Error('不支持此操作');
  }
  async tick() {
    if (this.running || this.stopped || !this.data.token) return;
    this.running = true;
    try {
      const recent = this.data.recent.filter(p => safePath(p) && this.app.vault.getAbstractFileByPath(p) instanceof TFile).map(path => ({path}));
      const response = await requestUrl({url: BASE + '/poll', method: 'POST', contentType: 'application/json',
        headers: {'X-Obsidian-Token': this.data.token}, body: JSON.stringify({vaultId: this.data.vaultId,
          vaultName: this.app.vault.getName(), focused: document.hasFocus(), recent, results: [...this.outbox.values()]})});
      for (const id of response.json.ack || []) this.outbox.delete(id);
      for (const job of response.json.jobs || []) {
        if (this.stopped || this.outbox.has(job.id)) continue;
        let result;
        try { result = await this.execute(job); } catch (e) { result = {error: e.message}; }
        this.outbox.set(job.id, {id: job.id, ...result});
      }
    } catch (_) { /* A disconnected desktop is not a successful read; reconnect next heartbeat. */ }
    finally { this.running = false; }
  }
  onunload() { this.stopped = true; }
};
