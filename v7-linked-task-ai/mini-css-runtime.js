(function browserCompatibilityRuntime() {
  'use strict';
  function ready() {
    var doc = document.documentElement;
    function viewport() { var h = window.visualViewport ? window.visualViewport.height : window.innerHeight; doc.style.setProperty('--app-height', Math.round(h) + 'px'); }
    viewport(); window.addEventListener('resize', viewport);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', viewport);
    document.addEventListener('visibilitychange', function () { doc.classList.toggle('mini-page-hidden', document.hidden); });
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
    probe.appendChild(document.createElement('div')); probe.appendChild(document.createElement('div'));
    document.body.appendChild(probe); var nativeGap = probe.scrollHeight === 1; probe.parentNode.removeChild(probe);
    if (nativeGap) { doc.classList.add('supports-flex-gap'); return; }
    doc.classList.add('mini-margin-gap');
    var tracked = new WeakMap(); var queued = []; var pending = false;
    function restore(child) {
      var previous = tracked.get(child);
      if (!previous) return;
      Object.keys(previous).forEach(function (prop) {
        if (child.style[prop] === previous[prop].applied) child.style[prop] = previous[prop].original;
      });
      tracked.delete(child);
    }
    function update(root) {
      if (!root || !document.documentElement.contains(root)) return;
      var nodes = [root]; if (root.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      var parents = [];
      // Responsive feature cards can switch from Flex to Grid. Restore old
      // fallback margins before checking their new display mode.
      nodes.forEach(function (node) { if (node.children) Array.prototype.forEach.call(node.children, restore); });
      nodes.forEach(function (node) {
        if (!node.children || !node.children.length) return;
        var style = getComputedStyle(node);
        if (style.display === 'flex' || style.display === 'inline-flex') parents.push(node);
      });
      parents.forEach(function (parent) { Array.prototype.forEach.call(parent.children, restore); });
      var updates = [];
      parents.forEach(function (parent) {
        var style = getComputedStyle(parent);
        var rowGap = parseFloat(style.getPropertyValue('--mini-row-gap')) || 0;
        var colGap = parseFloat(style.getPropertyValue('--mini-column-gap')) || 0;
        // Inline styles in existing task templates can also carry gap values.
        var inlineGap = (parent.style.getPropertyValue('gap') || '').split(/\s+/);
        if (inlineGap[0]) { rowGap = parseFloat(inlineGap[0]) || 0; colGap = parseFloat(inlineGap[1] || inlineGap[0]) || 0; }
        if (!rowGap && !colGap) return;
        var column = style.flexDirection.indexOf('column') === 0;
        var reverse = style.flexDirection.indexOf('reverse') >= 0;
        var side = column ? (reverse ? 'marginTop' : 'marginBottom') : (reverse ? 'marginLeft' : 'marginRight');
        var mainGap = column ? rowGap : colGap;
        var children = Array.prototype.filter.call(parent.children, function (child) {
          var childStyle = getComputedStyle(child); return childStyle.display !== 'none' && childStyle.position !== 'absolute' && childStyle.position !== 'fixed';
        });
        children.forEach(function (child, index) {
          var childStyle = getComputedStyle(child), changes = {};
          if (index < children.length - 1 && mainGap && childStyle[side] !== 'auto') changes[side] = (parseFloat(childStyle[side]) || 0) + mainGap + 'px';
          if (style.flexWrap !== 'nowrap' && !column && rowGap && childStyle.marginBottom !== 'auto') changes.marginBottom = (parseFloat(childStyle.marginBottom) || 0) + rowGap + 'px';
          if (Object.keys(changes).length) updates.push({ child: child, changes: changes });
        });
      });
      updates.forEach(function (change) {
        var saved = {};
        Object.keys(change.changes).forEach(function (prop) { saved[prop] = { original: change.child.style[prop], applied: change.changes[prop] }; change.child.style[prop] = change.changes[prop]; });
        tracked.set(change.child, saved);
      });
    }
    function enqueue(root) {
      if (!root || root.nodeType !== 1) return;
      if (queued.indexOf(root) < 0) queued.push(root);
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        var roots = queued; queued = []; pending = false;
        roots.filter(function (node, i) { return !roots.some(function (other, j) { return i !== j && other.contains(node); }); }).forEach(update);
      });
    }
    update(document.body);
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) { enqueue(record.type === 'attributes' ? record.target.parentElement || record.target : record.target); });
    });
    // Ignore style mutations: compatibility writes inline margins itself. App
    // view changes use child insertion / class toggles and are batched per frame.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', function () { enqueue(document.body); });
    window.MiniCssRefresh = function (root) { enqueue(root || document.body); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
