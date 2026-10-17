/* ============================================================================
 * Mobile Design Gallery — 交互与渲染（评审用，非生产代码）
 * 依赖：window.MDS（assets/screens.js）
 * ==========================================================================*/
(function () {
  var MDS = window.MDS || { screens: [], groups: [], tabbars: {} };
  var root = document.documentElement;

  var state = {
    theme: localStorage.getItem('mds-gallery-theme') === 'dark' ? 'dark' : 'light',
    platform: localStorage.getItem('mds-gallery-platform') === 'android' ? 'android' : 'ios',
    current: ''
  };

  var ICON = window.MDS_ICON || function () { return ''; };
  // gallery 不加载 screen.js（那是屏幕运行时），这里补几个自用 icon
  var GICON = {
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
    right: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    external: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    logo: '<path d="M4 5h9a6.5 6.5 0 0 1 0 13H4V5z"/><path d="M8 9h5a2.5 2.5 0 0 1 0 5H8V9z"/>',
    ios: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M11 5.5h2"/>',
    android: '<path d="M6 9h12v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9z"/><path d="M6 9a6 6 0 0 1 12 0"/><path d="M8 3l1.5 2M16 3l-1.5 2"/><path d="M10 14h.01M14 14h.01"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
    down: '<path d="M6 9l6 6 6-6"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || 'g-ico') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (GICON[name] || '') + '</svg>';
  }

  /* ---------------------------------------------------------------- 设备框 */
  function phoneMarkup(id, opts) {
    opts = opts || {};
    var cls = 'g-phone';
    var fixedPlatform = opts.platform || '';
    if (fixedPlatform === 'android') cls += ' g-phone--android';
    return '<div class="' + cls + '" data-chrome="' + (fixedPlatform ? 'fixed' : 'live') + '"' + (fixedPlatform ? ' data-platform-fixed="' + fixedPlatform + '"' : '') + '>' +
      '<div class="g-island"></div><div class="g-punch"></div>' +
      '<div class="g-screen"><iframe title="' + (opts.title || id) + ' 设计稿" data-file="' + id + '"' +
      (opts.lazy ? '' : ' data-eager="1"') + ' data-platform-fixed="' + fixedPlatform + '" scrolling="no"></iframe></div>' +
      '<div class="g-homebar"></div><div class="g-gesture"></div>' +
      '</div>';
  }

  /* ---------------------------------------------------------------- 主题 / 平台 */
  function setTheme(theme, persist) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', state.theme);
    if (persist !== false) localStorage.setItem('mds-gallery-theme', state.theme);
    var seg = document.getElementById('theme-seg');
    if (seg) {
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-theme-value') === state.theme);
    }
    document.querySelectorAll('iframe[data-file]').forEach(function (f) {
      try { f.contentWindow.postMessage({ source: 'mds-gallery', type: 'theme', value: state.theme }, '*'); } catch (e) { /* 未加载 */ }
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0b0f16' : '#f6f7f9');
  }
  function setPlatform(platform, persist) {
    state.platform = platform === 'android' ? 'android' : 'ios';
    if (persist !== false) localStorage.setItem('mds-gallery-platform', state.platform);
    var seg = document.getElementById('platform-seg');
    if (seg) {
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-platform-value') === state.platform);
    }
    document.querySelectorAll('.g-phone[data-chrome="live"]').forEach(function (p) {
      p.classList.toggle('g-phone--android', state.platform === 'android');
    });
    document.querySelectorAll('iframe[data-file]').forEach(function (f) {
      if (f.getAttribute('data-platform-fixed')) return;
      try { f.contentWindow.postMessage({ source: 'mds-gallery', type: 'platform', value: state.platform }, '*'); } catch (e) { /* 未加载 */ }
    });
  }

  /* ---------------------------------------------------------------- 懒加载 iframe */
  function frameUrl(file, platform) {
    var p = platform || state.platform;
    return 'screens/' + file + '.html?theme=' + state.theme + '&platform=' + p;
  }
  function loadFrame(f) {
    if (f.getAttribute('src')) return;
    var platform = f.getAttribute('data-platform-fixed') || state.platform;
    f.setAttribute('src', frameUrl(f.getAttribute('data-file'), platform));
  }
  function initLazy() {
    var frames = document.querySelectorAll('iframe[data-file]:not([src])');
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < frames.length; i++) loadFrame(frames[i]);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { loadFrame(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: '600px 0px' });
    for (var j = 0; j < frames.length; j++) io.observe(frames[j]);
  }

  /* ---------------------------------------------------------------- Hero 手机 */
  function renderHero() {
    var host = document.getElementById('hero-phones');
    if (!host) return;
    host.innerHTML =
      '<div class="g-hero-phone g-hero-phone--c">' + phoneMarkup('student-answer-objective', { title: '学生作答', lazy: true }) + '</div>' +
      '<div class="g-hero-phone g-hero-phone--a">' + phoneMarkup('student-home', { title: '学生首页', lazy: true }) + '</div>' +
      '<div class="g-hero-phone g-hero-phone--b">' + phoneMarkup('teacher-review-queue', { title: '教师审核队列', lazy: true }) + '</div>' +
      '<div class="g-float-tag g-float-tag--1"><b>37</b> 屏完整页面</div>' +
      '<div class="g-float-tag g-float-tag--2"><b>WCAG AA</b> 对比度与触控</div>' +
      '<div class="g-float-tag g-float-tag--3"><b>2 套主题</b> 浅色 / 深色</div>';
  }

  /* ---------------------------------------------------------------- 交互原型 */
  var protoFrame = null;
  function renderProto() {
    var nav = document.getElementById('proto-nav');
    var stage = document.getElementById('proto-device');
    var info = document.getElementById('proto-info');
    if (!nav || !stage || !info) return;
    var html = '';
    MDS.groups.forEach(function (g) {
      html += '<div class="g-nav-group" data-group="' + g.id + '"><button class="g-nav-group-h" type="button">' + g.name + '<span class="cnt">' + MDS.screens.filter(function (s) { return s.group === g.id; }).length + '</span></button>';
      MDS.screens.filter(function (s) { return s.group === g.id; }).forEach(function (s) {
        var n = MDS.screens.indexOf(s) + 1;
        html += '<button class="g-nav-item" type="button" data-screen="' + s.id + '"><span class="idx">' + (n < 10 ? '0' + n : n) + '</span><span class="name">' + s.title + '</span><span class="mini"></span></button>';
      });
      html += '</div>';
    });
    nav.innerHTML = '<div class="g-nav-head"><b>37 屏 · 可交互</b><span>点击切换，屏幕内可继续点按</span></div><div class="g-nav-list">' + html + '</div>';

    stage.innerHTML = '<div class="g-stage-bar"><span class="g-dots"><i></i><i></i><i></i></span><span class="g-url" id="proto-url">127.0.0.1:5173/exam/m/</span><span class="g-live"><i></i>LIVE</span></div>' +
      '<div class="g-stage-canvas">' + phoneMarkup('student-home', { title: '交互原型', eager: true }) + '</div>' +
      '<div class="g-stage-foot"><span>标题栏 / 状态栏 / 底部 Tab 均为真实组件</span><span>390 × 844 · 2× DPR</span></div>';

    info.innerHTML = '<div class="g-panel">' +
      '<div class="g-info-kicker"><span class="dot"></span><span id="proto-group">学生端</span></div>' +
      '<h3 id="proto-title">学生首页</h3>' +
      '<div class="g-info-id" id="proto-id">student-home</div>' +
      '<p class="g-desc" id="proto-desc"></p>' +
      '<div class="g-info-tags" id="proto-tags"></div>' +
      '<div class="g-info-actions"><button class="g-btn g-btn--primary" type="button" id="proto-full">' + icon('external') + '全屏查看</button><button class="g-btn g-btn--ghost" type="button" id="proto-copy">' + icon('copy') + '复制链接</button></div>' +
      '<div class="g-info-nav"><button class="g-btn g-btn--ghost g-btn--sm" type="button" id="proto-prev">' + icon('left') + '上一屏</button><button class="g-btn g-btn--ghost g-btn--sm" type="button" id="proto-next">下一屏' + icon('right') + '</button></div>' +
      '<div class="g-info-hint">在手机内点卡片、按钮、底部 Tab 会直接切到对应页面。键盘 <kbd>←</kbd> <kbd>→</kbd> 可切屏；浏览器地址栏的 <kbd>#screen=…</kbd> 可直接分享单屏。</div>' +
      '</div>';
    protoFrame = document.querySelector('#proto-device iframe');

    nav.addEventListener('click', function (e) {
      var groupBtn = e.target.closest('.g-nav-group-h');
      if (groupBtn) {
        var group = groupBtn.parentNode;
        group.classList.toggle('collapsed');
        var list = group.querySelectorAll('.g-nav-item');
        for (var i = 0; i < list.length; i++) list[i].style.display = group.classList.contains('collapsed') ? 'none' : '';
        return;
      }
      var item = e.target.closest('[data-screen]');
      if (item) navigate(item.getAttribute('data-screen'), { scroll: false });
    });
    document.getElementById('proto-prev').addEventListener('click', function () { step(-1); });
    document.getElementById('proto-next').addEventListener('click', function () { step(1); });
    document.getElementById('proto-full').addEventListener('click', function () {
      window.open('screens/' + state.current + '.html?theme=' + state.theme + '&platform=' + state.platform, '_blank');
    });
    document.getElementById('proto-copy').addEventListener('click', function () {
      var url = location.origin + location.pathname + '#screen=' + state.current;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url);
      toast('链接已复制：' + state.current);
    });
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.source === 'mds-screen' && d.type === 'goto' && d.id) navigate(d.id, { scroll: false });
    });
  }
  function step(dir) {
    var i = 0;
    for (var k = 0; k < MDS.screens.length; k++) { if (MDS.screens[k].id === state.current) { i = k; break; } }
    var next = (i + dir + MDS.screens.length) % MDS.screens.length;
    navigate(MDS.screens[next].id, { scroll: false });
  }
  function navigate(id, opts) {
    var screen = MDS.byId(id);
    if (!screen) return;
    state.current = id;
    if (protoFrame) protoFrame.setAttribute('src', frameUrl(id));
    var group = MDS.group(screen.group);
    var set = function (sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; };
    set('#proto-group', group ? group.name : '');
    set('#proto-title', screen.title);
    set('#proto-id', id);
    set('#proto-desc', screen.caption || '');
    var tags = document.getElementById('proto-tags');
    if (tags) tags.innerHTML = (screen.tags || []).map(function (t) { return '<span>' + t + '</span>'; }).join('') + '<span>' + (group ? group.name : '') + '</span>';
    var url = document.getElementById('proto-url');
    if (url) url.textContent = '127.0.0.1:5173/exam/m/' + id;
    document.querySelectorAll('.g-nav-item').forEach(function (b) {
      var on = b.getAttribute('data-screen') === id;
      b.classList.toggle('on', on);
      if (on && opts && opts.scroll !== false) {
        var panel = b.closest('.g-nav-list');
        if (panel) panel.scrollTop = Math.max(0, b.offsetTop - panel.clientHeight / 2);
      }
    });
    if (opts && opts.scroll === 'info') {
      var info = document.getElementById('proto-info');
      if (info) info.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    try { history.replaceState(null, '', '#screen=' + id); } catch (e) { /* file:// 可能限制 */ }
    document.title = screen.title + ' · Deadpan 移动端设计稿';
  }

  /* ---------------------------------------------------------------- 全部页面 */
  function renderGallery() {
    var host = document.getElementById('gallery-groups');
    if (!host) return;
    var html = '';
    MDS.groups.forEach(function (g, gi) {
      var list = MDS.screens.filter(function (s) { return s.group === g.id; });
      html += '<section class="g-group" id="group-' + g.id + '">' +
        '<div class="g-group-head"><div><h3>' + g.name + '</h3><p>' + g.desc + '</p></div><span class="g-group-role">' + list.length + ' screens · ' + g.role + '</span></div>' +
        '<div class="g-screen-grid">';
      list.forEach(function (s) {
        html += '<article class="g-screen-card">' +
          '<div class="g-thumb" data-open-screen="' + s.id + '" role="button" tabindex="0" aria-label="在交互原型中打开 ' + s.title + '">' + phoneMarkup(s.id, { title: s.title, lazy: true }) + '</div>' +
          '<div class="g-screen-cap"><b>' + s.title + '</b><span>' + s.id + '</span></div>' +
          '<div class="g-screen-tags">' + (s.tags || []).map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
          '<button class="g-screen-open" type="button" data-open-screen="' + s.id + '">在原型中打开' + icon('right') + '</button>' +
          '</article>';
      });
      html += '</div></section>';
    });
    host.innerHTML = html;
    host.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open-screen]');
      if (!open) return;
      var id = open.getAttribute('data-open-screen');
      document.getElementById('prototype').scrollIntoView({ behavior: 'smooth', block: 'start' });
      navigate(id, { scroll: false });
    });
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var open = e.target.closest('[data-open-screen]');
      if (!open) return;
      e.preventDefault();
      var id = open.getAttribute('data-open-screen');
      document.getElementById('prototype').scrollIntoView({ behavior: 'smooth', block: 'start' });
      navigate(id, { scroll: false });
    });
    var nav = document.getElementById('group-links');
    if (nav) nav.innerHTML = MDS.groups.map(function (g) {
      var n = MDS.screens.filter(function (s) { return s.group === g.id; }).length;
      return '<a href="#group-' + g.id + '">' + g.name + '<b>' + n + '</b></a>';
    }).join('');
  }

  /* ---------------------------------------------------------------- 平台对比 */
  function renderPlatformCompare() {
    var host = document.getElementById('platform-compare');
    if (!host) return;
    var ios = '<div class="g-thumb">' + phoneMarkup('teacher-home', { title: 'iOS', lazy: true, platform: 'ios' }) + '</div>';
    var and = '<div class="g-thumb">' + phoneMarkup('teacher-home', { title: 'Android', lazy: true, platform: 'android' }) + '</div>';
    host.innerHTML =
      '<div class="g-panel"><div class="g-panel-h"><h4>' + icon('ios') + ' iOS · Safari / PWA</h4><span>390 × 844 · 安全区 44/34</span></div>' + ios +
      '<div class="g-platform-caps"><div class="g-cap"><span>底部 Home Indicator</span><span class="yes">已适配</span></div><div class="g-cap"><span>下拉刷新 / 左滑</span><span class="yes">原生手势</span></div><div class="g-cap"><span>添加到主屏（PWA）</span><span class="part">Safari 分享菜单</span></div><div class="g-cap"><span>推送</span><span class="part">16.4+ 且需主屏</span></div></div></div>' +
      '<div class="g-panel"><div class="g-panel-h"><h4>' + icon('android') + ' Android · Chrome / 微信</h4><span>390 × 844 · 安全区 24/16</span></div>' + and +
      '<div class="g-platform-caps"><div class="g-cap"><span>系统返回键</span><span class="yes">Capacitor 接管</span></div><div class="g-cap"><span>手势条 / 打孔屏</span><span class="yes">已适配</span></div><div class="g-cap"><span>APK 内部分发</span><span class="yes">扫码安装</span></div><div class="g-cap"><span>WebView 版本碎片</span><span class="part">只使用成熟 CSS</span></div></div></div>';
  }

  /* ---------------------------------------------------------------- Toast */
  var toastTimer = null;
  function toast(text) {
    var el = document.getElementById('g-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ---------------------------------------------------------------- 启动 */
  function init() {
    setTheme(state.theme, false);
    setPlatform(state.platform, false);
    renderHero();
    renderProto();
    renderGallery();
    renderPlatformCompare();
    setPlatform(state.platform, false); // 给新渲染的 frame 同步 chrome
    setTheme(state.theme, false);
    initLazy();

    // 顶栏主题/平台切换
    var themeSeg = document.getElementById('theme-seg');
    if (themeSeg) themeSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setTheme(b.getAttribute('data-theme-value'));
    });
    var platSeg = document.getElementById('platform-seg');
    if (platSeg) platSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setPlatform(b.getAttribute('data-platform-value'));
    });

    // 初始屏：地址栏 #screen=id 优先
    var m = /#screen=([a-z0-9-]+)/.exec(location.hash || '');
    var initial = (m && MDS.byId(m[1])) ? m[1] : 'student-home';
    navigate(initial, { scroll: false });

    document.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
    window.addEventListener('hashchange', function () {
      var m2 = /#screen=([a-z0-9-]+)/.exec(location.hash || '');
      if (m2 && m2[1] !== state.current && MDS.byId(m2[1])) navigate(m2[1], { scroll: false });
    });
    var year = document.getElementById('g-year');
    if (year) year.textContent = String(new Date().getFullYear());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
