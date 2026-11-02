/* Selection survives scrolling/search refresh; only explicit choices are exported. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SYWechatStore = factory;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  let current = {groups: [], contacts: [], messages: [], conversations: []};
  const selected = new Map();
  let crops = [];
  const key = message => JSON.stringify([message.group || '', message.sender || '', message.time || '', message.text || '', message.image || '']);
  const unique = messages => Array.from(new Map(messages.filter(m => m && typeof m.text === 'string' && m.text.trim()).map(m => [key(m), {...m}])).values());
  return {
    key,
    view: () => current,
    chosen: () => Array.from(selected.values()),
    has: message => selected.has(key(message)),
    set(result, append = false) {
      if (append) {
        const added = (result.messages || []).filter(m => m.crop);
        const next = unique([...crops, ...added]);
        if (next.length > 10) throw Error('已保留10次框选，请先勾选带入正文，再继续收集。');
        crops = next;
        current = {...current, messages: unique([...current.messages, ...(result.messages || [])])};
      } else current = {...result, groups: result.groups || [], contacts: result.contacts || [], conversations: result.conversations || [], messages: unique([...(result.messages || []), ...crops])};
      return current;
    },
    select(message, enabled) {
      const id = key(message);
      if (enabled && !selected.has(id) && selected.size >= 100) throw Error('已经选择100条内容，请先带入正文，再继续收集。');
      if (enabled) selected.set(id, {...message}); else selected.delete(id);
    },
    clear() { selected.clear(); }
  };
});
