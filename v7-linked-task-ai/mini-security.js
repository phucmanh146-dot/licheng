(function () {
  'use strict';
  var purifier = window.DOMPurify;
  // Never fall back to rendering unsanitized markup on an unsupported engine.
  if (!purifier || !purifier.isSupported) {
    if (purifier) purifier.sanitize = function () { return ''; };
    document.body.textContent = '当前环境不能安全显示此作品，请更新客户端后重试。';
    throw new Error('Required HTML sanitizer is unavailable');
  }
  purifier.setConfig({
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'foreignObject', 'animate', 'set', 'animateMotion', 'animateTransform'],
    FORBID_ATTR: ['srcdoc', 'srcset', 'action', 'formaction', 'target', 'download', 'ping', 'background', 'lowsrc', 'dynsrc', 'codebase', 'archive'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: true
  });
  purifier.addHook('uponSanitizeAttribute', function (node, attribute) {
    var name = attribute.attrName.toLowerCase();
    var value = String(attribute.attrValue || '').trim();
    if (name === 'href' || name === 'xlink:href') {
      attribute.keepAttr = /^#[A-Za-z0-9_-]*$/.test(value);
      try {
        var link = new URL(value);
        if (/^https?:$/.test(link.protocol) && !link.username && !link.password) attribute.keepAttr = true;
        if (/^obsidian:\/\/(?:open\?|choose-vault(?:\?|$))/.test(value)) attribute.keepAttr = true;
      } catch (_) {}
    } else if (name === 'src' || name === 'poster') {
      // Only the bundled assets and raster images selected by the user.
      attribute.keepAttr = /^(?:\.\/)?assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value) ||
        (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length < 1400000);
    } else if (name === 'style') {
      // DOMPurify handles HTML. CSS needs its own check to prevent network loads.
      attribute.keepAttr = !/[\\\x00-\x1f]|url\s*\(|image-set\s*\(|@import|expression\s*\(|-moz-binding|behavior\s*:|https?:|data:|blob:|\/\/|\/\*|\*\//i.test(value);
    } else if (name === 'fill' || name === 'stroke' || name === 'filter' || name === 'clip-path' || name === 'mask') {
      if (/url\s*\(/i.test(value)) attribute.keepAttr = /^url\(#[A-Za-z0-9_-]+\)$/.test(value);
    }
  });
})();
