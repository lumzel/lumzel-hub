/* OpenDesign Canvas Runtime (runs inside artifact preview iframe) */
(function () {
  if (window.__odBridgeInstalled) return;
  window.__odBridgeInstalled = true;

  var mode = 'preview';
  var hoverEl = null;
  var selectedOid = '';
  var selectColor = '#0070e3';
  var hoverColor = '#d97706';
  var badgeFgColor = '#ffffff';

  function softTint(color, pct) {
    return 'color-mix(in srgb, ' + color + ' ' + pct + '%, transparent)';
  }

  function styleOverlay(box, borderColor, pct) {
    if (!box) return;
    box.style.borderColor = borderColor;
    box.style.background = softTint(borderColor, pct);
    var badge = box.firstChild;
    if (badge) {
      badge.style.background = borderColor;
      badge.style.color = badgeFgColor;
    }
  }

  function applyOverlayTheme() {
    styleOverlay(document.getElementById('__od-select-box'), selectColor, 10);
    styleOverlay(document.getElementById('__od-hover-box'), hoverColor, 8);
  }

  function ensureStyle(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      var head = document.head || document.documentElement;
      if (id === 'od-system-tokens') {
        var tweaksEl = document.getElementById('od-tweaks');
        if (tweaksEl && tweaksEl.parentNode === head) {
          head.insertBefore(el, tweaksEl);
          return el;
        }
      }
      head.appendChild(el);
    }
    return el;
  }

  function createOverlay(id, borderColor, bgColor, zIndex) {
    var box = document.getElementById(id);
    if (box) return box;
    box = document.createElement('div');
    box.id = id;
    box.setAttribute('data-od-ui', '1');
    box.style.cssText =
      'position:fixed;pointer-events:none;z-index:' +
      zIndex +
      ';border:2px solid ' +
      borderColor +
      ';background:' +
      bgColor +
      ';border-radius:4px;display:none;transition:all 80ms ease;box-sizing:border-box;';
    var tag = document.createElement('span');
    tag.setAttribute('data-od-ui', '1');
    tag.style.cssText =
      'position:absolute;top:-20px;left:-2px;padding:1px 6px;border-radius:3px;font:600 10px/16px ui-monospace,SFMono-Regular,Menlo,monospace;background:' +
      borderColor +
      ';color:' +
      badgeFgColor +
      ';white-space:nowrap;letter-spacing:0.01em;';
    box.appendChild(tag);
    (document.body || document.documentElement).appendChild(box);
    return box;
  }

  function placeBox(box, el, label) {
    if (!el || !el.getBoundingClientRect) {
      box.style.display = 'none';
      return;
    }
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.style.left = Math.max(0, r.left) + 'px';
    box.style.top = Math.max(0, r.top) + 'px';
    box.style.width = Math.max(4, r.width) + 'px';
    box.style.height = Math.max(4, r.height) + 'px';
    var badge = box.firstChild;
    if (badge) {
      badge.textContent = label || '';
      badge.style.top = r.top < 24 ? '2px' : '-20px';
      badge.style.left = r.top < 24 ? '2px' : '-2px';
    }
  }

  function cssSelectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    var oid = el.getAttribute('data-od-id');
    if (oid) return '[data-od-id="' + oid + '"]';
    if (el.id) return '#' + el.id;
    var tag = el.tagName.toLowerCase();
    var cls =
      typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    return tag + cls;
  }

  function resolveTarget(raw) {
    if (!raw || raw.nodeType !== 1) return null;
    if (raw.closest && raw.closest('[data-od-ui]')) return null;
    if (raw === document.documentElement || raw === document.body) return null;
    var tagged = raw.closest ? raw.closest('[data-od-id]') : null;
    if (tagged) return tagged;
    var semantic = raw.closest
      ? raw.closest('button,a,input,select,textarea,article,section,header,nav,aside,footer,table,form,h1,h2,h3,p,li,div')
      : raw;
    return semantic || raw;
  }

  function applyTweaks(tweaks) {
    var style = ensureStyle('od-tweaks');
    if (!tweaks || typeof tweaks !== 'object') {
      style.textContent = '';
      return;
    }
    var lines = [];
    for (var key in tweaks) {
      if (Object.prototype.hasOwnProperty.call(tweaks, key) && tweaks[key] != null && tweaks[key] !== '') {
        lines.push('  ' + key + ': ' + tweaks[key] + ';');
      }
    }
    style.textContent = lines.length ? ':root {\n' + lines.join('\n') + '\n}' : '';
  }

  function syncSelectedOutline() {
    var selBox = createOverlay('__od-select-box', selectColor, softTint(selectColor, 10), 2147483645);
    styleOverlay(selBox, selectColor, 10);
    if (!selectedOid) {
      selBox.style.display = 'none';
      return;
    }
    var target = document.querySelector('[data-od-id="' + CSS.escape(selectedOid) + '"]');
    if (!target) {
      selBox.style.display = 'none';
      return;
    }
    placeBox(selBox, target, selectedOid);
  }

  function setMode(nextMode) {
    mode = nextMode === 'inspect' ? 'inspect' : 'preview';
    document.documentElement.style.cursor = mode === 'inspect' ? 'crosshair' : '';
    var hoverBox = createOverlay('__od-hover-box', hoverColor, softTint(hoverColor, 8), 2147483646);
    styleOverlay(hoverBox, hoverColor, 8);
    if (mode !== 'inspect') {
      hoverEl = null;
      hoverBox.style.display = 'none';
      var selBox = document.getElementById('__od-select-box');
      if (selBox && !selectedOid) selBox.style.display = 'none';
    }
  }

  document.addEventListener(
    'mousemove',
    function (e) {
      if (mode !== 'inspect') return;
      var target = resolveTarget(e.target);
      var hoverBox = createOverlay('__od-hover-box', hoverColor, softTint(hoverColor, 8), 2147483646);
      if (!target) {
        hoverEl = null;
        hoverBox.style.display = 'none';
        return;
      }
      hoverEl = target;
      var label = target.getAttribute('data-od-id') || cssSelectorFor(target);
      placeBox(hoverBox, target, label);
    },
    true,
  );

  document.addEventListener(
    'mouseleave',
    function () {
      var hoverBox = document.getElementById('__od-hover-box');
      if (hoverBox) hoverBox.style.display = 'none';
    },
    true,
  );

  document.addEventListener(
    'click',
    function (e) {
      if (mode !== 'inspect') return;
      var target = resolveTarget(e.target);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();

      var oid = target.getAttribute('data-od-id') || '';
      selectedOid = oid;
      var selBox = createOverlay('__od-select-box', selectColor, softTint(selectColor, 10), 2147483645);
      styleOverlay(selBox, selectColor, 10);
      placeBox(selBox, target, oid || cssSelectorFor(target));

      var cs = window.getComputedStyle ? window.getComputedStyle(target) : null;
      var r = target.getBoundingClientRect();
      var text = (target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 96);
      window.parent.postMessage(
        {
          type: 'od:select',
          oid: oid,
          tag: target.tagName.toLowerCase(),
          selector: cssSelectorFor(target),
          text: text,
          rect: {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          styles: cs
            ? {
                color: cs.color,
                backgroundColor: cs.backgroundColor,
                fontSize: cs.fontSize,
                borderRadius: cs.borderRadius,
                padding: cs.padding,
              }
            : {},
        },
        '*',
      );
    },
    true,
  );

  window.addEventListener('scroll', syncSelectedOutline, true);
  window.addEventListener('resize', syncSelectedOutline);

  window.addEventListener('message', function (event) {
    var msg = event && event.data;
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'od:mode') {
      setMode(msg.mode);
    } else if (msg.type === 'od:tokens') {
      if (typeof msg.tokensCss === 'string') {
        ensureStyle('od-system-tokens').textContent = msg.tokensCss;
      }
      if ('tweaks' in msg) {
        applyTweaks(msg.tweaks);
      }
      syncSelectedOutline();
    } else if (msg.type === 'od:tweak') {
      applyTweaks(msg.tweaks || msg.vars);
      syncSelectedOutline();
    } else if (msg.type === 'od:highlight') {
      selectedOid = msg.oid ? String(msg.oid) : '';
      var el = selectedOid ? document.querySelector('[data-od-id="' + CSS.escape(selectedOid) + '"]') : null;
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      syncSelectedOutline();
    } else if (msg.type === 'od:theme') {
      if (typeof msg.brand === 'string' && msg.brand.trim()) selectColor = msg.brand.trim();
      if (typeof msg.gate === 'string' && msg.gate.trim()) hoverColor = msg.gate.trim();
      if (typeof msg.fg === 'string' && msg.fg.trim()) badgeFgColor = msg.fg.trim();
      applyOverlayTheme();
    }
  });

  function notifyReady() {
    try {
      window.parent.postMessage({ type: 'od:ready' }, '*');
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyReady);
  } else {
    notifyReady();
  }
})();
