/* ============================================================================
 * Exam-DeepSeek · Mobile Screen Runtime v1.0  (design-preview only)
 * 职责：主题/平台参数、状态栏、底部 Tab、图标库、页面内交互、QR 占位渲染。
 * 依赖：window.MDS（assets/screens.js）
 * ==========================================================================*/
(function () {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var screenId = document.body.getAttribute('data-screen') || '';
  var registry = window.MDS || { screens: [], tabbars: {} };

  /* ---------------------------------------------------------------- 1. 主题 / 平台 */
  function setTheme(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0f16' : '#f6f7f9');
  }
  function setPlatform(platform) {
    root.setAttribute('data-platform', platform === 'android' ? 'android' : 'ios');
  }
  setTheme(params.get('theme') || (window.parent !== window ? 'light' : 'light'));
  setPlatform(params.get('platform') || 'ios');

  /* ---------------------------------------------------------------- 2. 图标库（内联 SVG，线性 1.8） */
  var ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    'chevron-right': '<path d="M9 18l6-6-6-6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-up': '<path d="M6 15l6-6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    assignments: '<rect x="4" y="4" width="16" height="17" rx="2.5"/><path d="M8 9.5h8M8 14h8M8 18.5h5"/>',
    review: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.2 3.1-5 6.5-5s6 1.8 6.5 5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 15.4c1.7.6 2.8 2 3 4.6"/>',
    scores: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/>',
    chart: '<path d="M3 20h18"/><path d="M6 20v-6M11 20V10M16 20v-4M21 20V6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    code: '<path d="M9 18l-6-6 6-6"/><path d="M15 6l6 6-6 6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v5M14 11v5"/>',
    star: '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z"/>',
    alert: '<path d="M12 3L2 21h20L12 3z"/><path d="M12 9v6M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    'wifi-off': '<path d="M2 2l20 20"/><path d="M8.5 8.5a10 10 0 0 1 12 3"/><path d="M5 12a10 10 0 0 1 3.4-2.4"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
    'arrow-right': '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4"/><path d="M10 6l-6 6 6 6"/>',
    'arrow-up': '<path d="M12 20V4"/><path d="M6 10l6-6 6 6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    play: '<path d="M8 5l12 7-12 7V5z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sort: '<path d="M7 4v16M3 8l4-4 4 4"/><path d="M17 20V4M13 16l4 4 4-4"/>',
    external: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4z"/><path d="M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3V4z"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    logo: '<path d="M4 5h9a6.5 6.5 0 0 1 0 13H4V5z"/><path d="M8 9h5a2.5 2.5 0 0 1 0 5H8V9z"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    inbox: '<path d="M4 4h16v16H4z" opacity="0"/><path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6l2-8z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    'rotate-ccw': '<path d="M4 11a8 8 0 1 0 2.3-5.7"/><path d="M4 4v7h7"/>'
  };

  function iconSvg(name, cls) {
    var body = ICONS[name] || '';
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  window.MDS_ICON = iconSvg;

  function hydrateIcons(scope) {
    var nodes = (scope || document).querySelectorAll('[data-icon]:not([data-icon-done])');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-icon');
      var size = el.getAttribute('data-icon-size');
      if (el.tagName === 'BUTTON' || el.tagName === 'A') {
        el.insertAdjacentHTML('afterbegin', iconSvg(name, size === 'sm' ? 'icon--sm' : ''));
      } else {
        el.innerHTML = iconSvg(name, size === 'sm' ? 'icon--sm' : '');
      }
      el.setAttribute('data-icon-done', '1');
    }
  }

  /* ---------------------------------------------------------------- 3. 状态栏 */
  var SIGNAL = '<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" opacity=".35"/></svg>';
  var WIFI = '<svg viewBox="0 0 16 12" aria-hidden="true"><path d="M8 9.5a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z" fill="currentColor"/><path d="M3.6 6.6a6.4 6.4 0 0 1 8.8 0" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M1 4a10 10 0 0 1 14 0" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>';
  var BATTERY = '<span class="sb-battery" aria-hidden="true"><i></i></span>';
  function injectStatusbar() {
    var sb = document.createElement('div');
    sb.className = 'statusbar';
    sb.setAttribute('aria-hidden', 'true');
    sb.innerHTML = '<span class="sb-time">16:32</span><span class="sb-icons">' + SIGNAL + WIFI + BATTERY + '</span>';
    document.body.insertBefore(sb, document.body.firstChild);
  }

  /* ---------------------------------------------------------------- 4. 底部 Tab */
  function renderTabbar() {
    var host = document.querySelector('[data-tabbar]');
    if (!host) return;
    var role = host.getAttribute('data-tabbar');
    var active = host.getAttribute('data-active') || '';
    var tabs = (registry.tabbars && registry.tabbars[role]) || [];
    var html = '<nav class="tabbar" aria-label="主导航">';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var isActive = t.key === active;
      html += '<button type="button" class="tabbar-item' + (isActive ? ' active' : '') + '" data-goto="' + t.goto + '"' + (isActive ? ' aria-current="page"' : '') + '>' +
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[t.icon] || '') + '</svg>' +
        '<span>' + t.label + '</span>' +
        (t.badge ? '<span class="tabbar-badge" aria-label="' + t.badge + ' 项待办">' + t.badge + '</span>' : '') +
        '</button>';
    }
    html += '</nav>';
    host.outerHTML = html;
  }

  /* ---------------------------------------------------------------- 5. 导航 / 交互 */
  function goto(id) {
    if (!id) return;
    var meta = registry.byId ? registry.byId(id) : null;
    var file = (meta ? meta.id : id) + '.html';
    var qs = '?theme=' + root.getAttribute('data-theme') + '&platform=' + root.getAttribute('data-platform');
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'mds-screen', type: 'goto', id: meta ? meta.id : id }, '*');
    } else {
      location.href = file + qs;
    }
  }

  function closeSheet(sheet) {
    if (!sheet) return;
    sheet.classList.remove('open');
    var mask = document.querySelector('.mask[data-for="' + sheet.id + '"]') || document.querySelector('.mask.open');
    if (mask) mask.classList.remove('open');
  }
  function openSheet(sheet) {
    if (!sheet) return;
    sheet.classList.add('open');
    var mask = document.querySelector('.mask[data-for="' + sheet.id + '"]');
    if (!mask) {
      mask = document.createElement('div');
      mask.className = 'mask';
      mask.setAttribute('data-for', sheet.id);
      document.body.appendChild(mask);
    }
    // 强制 reflow 后再加 open，保证过渡生效
    void mask.offsetWidth;
    mask.classList.add('open');
  }
  function initSheets() {
    document.addEventListener('click', function (e) {
      var opener = e.target.closest('[data-open-sheet]');
      if (opener) {
        e.preventDefault();
        var id = opener.getAttribute('data-open-sheet');
        openSheet(document.getElementById(id));
        return;
      }
      var closer = e.target.closest('[data-close-sheet]');
      if (closer) {
        e.preventDefault();
        closeSheet(closer.closest('.sheet'));
        return;
      }
      var mask = e.target.closest('.mask');
      if (mask) {
        var sheet = document.getElementById(mask.getAttribute('data-for'));
        closeSheet(sheet);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var open = document.querySelector('.sheet.open');
        if (open) closeSheet(open);
      }
    });
  }
  function initSelection() {
    document.addEventListener('click', function (e) {
      var group = e.target.closest('[data-select-group]');
      if (!group) return;
      var item = e.target.closest('[data-select]');
      if (!item) return;
      var items = group.querySelectorAll('[data-select]');
      var multi = group.getAttribute('data-select-group') === 'multi';
      for (var i = 0; i < items.length; i++) {
        if (multi) { if (items[i] === item) items[i].classList.toggle('selected'); }
        else { items[i].classList.toggle('selected', items[i] === item); }
      }
      if (!multi) {
        var radio = item.querySelector('.radio');
        if (radio) {
          var radios = group.querySelectorAll('.radio');
          for (var j = 0; j < radios.length; j++) radios[j].classList.remove('on');
          radio.classList.add('on');
        }
      }
    });
  }
  function initSegments() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (!btn) return;
      var group = btn.closest('[data-tabgroup]');
      if (!group) return;
      var tabs = group.querySelectorAll('[data-tab]');
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i] === btn);
      var name = btn.getAttribute('data-tab');
      var panels = document.querySelectorAll('[data-tabpanel]');
      for (var j = 0; j < panels.length; j++) {
        panels[j].classList.toggle('is-active', panels[j].getAttribute('data-tabpanel') === name);
      }
    });
  }
  function initSwitches() {
    document.addEventListener('click', function (e) {
      var sw = e.target.closest('[data-switch]');
      if (!sw) return;
      sw.classList.toggle('on');
      sw.setAttribute('aria-checked', sw.classList.contains('on') ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      var chk = e.target.closest('[data-check]');
      if (!chk) return;
      chk.classList.toggle('on');
    });
  }
  function initGoto() {
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]');
      if (!g) return;
      e.preventDefault();
      goto(g.getAttribute('data-goto'));
    });
  }

  /* ---------------------------------------------------------------- 6. QR 占位（确定性伪随机，仅视觉） */
  function renderQrs() {
    var nodes = document.querySelectorAll('[data-qr]:not([data-qr-done])');
    for (var k = 0; k < nodes.length; k++) {
      var n = 21;
      var mods = [];
      function inFinder(x, y, ox, oy) {
        var dx = x - ox, dy = y - oy;
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
        var edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        var core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return edge || core;
      }
      function insideFinder(x, y) {
        return inFinder(x, y, 0, 0) !== null || inFinder(x, y, n - 7, 0) !== null || inFinder(x, y, 0, n - 7) !== null;
      }
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var f = inFinder(x, y, 0, 0);
          if (f === null) f = inFinder(x, y, n - 7, 0);
          if (f === null) f = inFinder(x, y, 0, n - 7);
          var on;
          if (f !== null) on = f;
          else if (insideFinder(x, y)) on = false;
          else {
            var h = (x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995;
            on = (Math.abs(h) % 100) > 46;
          }
          if (on) mods.push('<rect x="' + x + '" y="' + y + '" width="1" height="1"/>');
        }
      }
      nodes[k].innerHTML = '<svg viewBox="0 0 ' + n + ' ' + n + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">' +
        '<rect width="' + n + '" height="' + n + '" fill="#ffffff"/><g fill="#0b0f16">' + mods.join('') + '</g></svg>';
      nodes[k].setAttribute('data-qr-done', '1');
    }
  }

  /* ---------------------------------------------------------------- 7. 与 Gallery 通信 */
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.source !== 'mds-gallery') return;
    if (d.type === 'theme') setTheme(d.value);
    if (d.type === 'platform') setPlatform(d.value);
  });
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'mds-screen', type: 'ready', id: screenId }, '*');
    }
  } catch (err) { /* 忽略：单独打开时没有父页面 */ }

  /* ---------------------------------------------------------------- 8. 启动 */
  injectStatusbar();
  renderTabbar();
  hydrateIcons(document);
  initSheets();
  initSelection();
  initSegments();
  initSwitches();
  initGoto();
  renderQrs();

  // 代码行号列对读屏隐藏（04 §7；评审 P2-6）
  var lineNos = document.querySelectorAll(".codeline .ln, .diffline .dln");
  for (var li = 0; li < lineNos.length; li++) lineNos[li].setAttribute("aria-hidden", "true");
})();
