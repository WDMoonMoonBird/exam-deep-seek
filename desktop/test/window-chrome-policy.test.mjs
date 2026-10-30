/**
 * window-chrome-policy.test.mjs —— Windows 原生窗口外观的纯决策测试（无需 Electron）。
 *
 * 覆盖 platform-chrome.mjs：版本门禁（Win11 22H2+ 才有系统亚克力）、WCO 窗口参数、
 * preload 标记参数；以及 security-policy 对 additionalArguments 的白名单。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKDROP_ACRYLIC, BACKDROP_NONE, WINDOWS_BACKDROP_MIN_BUILD, WINDOWS_TITLEBAR_HEIGHT,
  platformWindowOptions, rendererChromeArgs, titleBarOverlay, windowsBackdrop, windowsBuildNumber,
} from '../src/main/platform-chrome.mjs';
import { secureWebPreferences } from '../src/main/security-policy.mjs';

test('windowsBuildNumber：解析 10.0.<build>，异常输入回 0', () => {
  assert.equal(windowsBuildNumber('10.0.22631'), 22631);
  assert.equal(windowsBuildNumber('10.0.19045.4291'), 19045);
  assert.equal(windowsBuildNumber('10.0.26100'), 26100);
  assert.equal(windowsBuildNumber(''), 0);
  assert.equal(windowsBuildNumber(undefined), 0);
  assert.equal(windowsBuildNumber('not-a-version'), 0);
});

test('windowsBackdrop：只有 Win11 22H2+ 才启用系统亚克力', () => {
  assert.equal(WINDOWS_BACKDROP_MIN_BUILD, 22621);
  assert.equal(windowsBackdrop('10.0.22621'), BACKDROP_ACRYLIC);
  assert.equal(windowsBackdrop('10.0.22631'), BACKDROP_ACRYLIC);
  assert.equal(windowsBackdrop('10.0.26100'), BACKDROP_ACRYLIC);
  // Win11 21H2 与所有 Win10 都没有 DWM_SYSTEMBACKDROP_TYPE
  assert.equal(windowsBackdrop('10.0.22000'), BACKDROP_NONE);
  assert.equal(windowsBackdrop('10.0.19045'), BACKDROP_NONE);
  assert.equal(windowsBackdrop('10.0.17763'), BACKDROP_NONE);
  assert.equal(windowsBackdrop(undefined), BACKDROP_NONE);
});

test('platformWindowOptions：macOS 行为保持不变', () => {
  const chrome = platformWindowOptions('darwin', '15.0');
  assert.equal(chrome.titleBarStyle, 'hiddenInset');
  assert.deepEqual(chrome.trafficLightPosition, { x: 16, y: 18 });
  assert.equal(chrome.vibrancy, 'sidebar');
  assert.equal(chrome.visualEffectState, 'active');
  assert.equal(chrome.backgroundColor, '#00000000');
});

test('platformWindowOptions：Win11 22H2+ 用 WCO + 系统亚克力，且不设不透明底', () => {
  const chrome = platformWindowOptions('win32', '10.0.22631');
  assert.equal(chrome.titleBarStyle, 'hidden');
  assert.equal(chrome.backgroundMaterial, 'acrylic');
  assert.equal(Object.hasOwn(chrome, 'backgroundColor'), false, '不透明底会盖掉 DWM 材质');
  assert.equal(chrome.titleBarOverlay.height, WINDOWS_TITLEBAR_HEIGHT);
  assert.equal(chrome.titleBarOverlay.color, 'rgba(0, 0, 0, 0)');
});

test('platformWindowOptions：Win10 保留 WCO 系统按钮但不假装玻璃（不透明回退）', () => {
  const chrome = platformWindowOptions('win32', '10.0.19045.4291');
  assert.equal(chrome.titleBarStyle, 'hidden');
  assert.equal(Object.hasOwn(chrome, 'backgroundMaterial'), false);
  assert.equal(chrome.backgroundColor, '#ffffff');
  assert.equal(chrome.titleBarOverlay.height, WINDOWS_TITLEBAR_HEIGHT);
});

test('platformWindowOptions：Linux 维持 v0 行为', () => {
  assert.deepEqual(platformWindowOptions('linux', '6.5.0'), { backgroundColor: '#ffffff' });
});

test('rendererChromeArgs：只有 Windows 需要把亚克力档位传给 preload', () => {
  assert.deepEqual(rendererChromeArgs('win32', '10.0.22631'), ['--desktop-backdrop=acrylic']);
  assert.deepEqual(rendererChromeArgs('win32', '10.0.22000'), ['--desktop-backdrop=none']);
  assert.deepEqual(rendererChromeArgs('win32', '10.0.19045'), ['--desktop-backdrop=none']);
  assert.deepEqual(rendererChromeArgs('darwin', '15.0'), []);
  assert.deepEqual(rendererChromeArgs('linux', '6.5.0'), []);
});

test('titleBarOverlay：按钮符号色跟随页面主题，覆盖层始终透明', () => {
  assert.equal(titleBarOverlay('light').symbolColor, '#101418');
  assert.equal(titleBarOverlay('dark').symbolColor, '#f3f4f6');
  assert.equal(titleBarOverlay(null).symbolColor, '#f3f4f6', '未知主题按深色给安全值');
  for (const theme of ['light', 'dark', null]) {
    assert.equal(titleBarOverlay(theme).color, 'rgba(0, 0, 0, 0)');
    assert.equal(titleBarOverlay(theme).height, WINDOWS_TITLEBAR_HEIGHT);
  }
});

test('secureWebPreferences：additionalArguments 只放行 --desktop- 前缀', () => {
  const preferences = secureWebPreferences({
    preload: '/tmp/preload.cjs',
    devTools: false,
    additionalArguments: ['--desktop-backdrop=acrylic', '--inspect=9229', '--no-sandbox', '--desktop-x=1'],
  });
  assert.deepEqual(preferences.additionalArguments, ['--desktop-backdrop=acrylic', '--desktop-x=1']);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
});

test('secureWebPreferences：没有合法参数时不写 additionalArguments', () => {
  const preferences = secureWebPreferences({ additionalArguments: ['--inspect=9229'] });
  assert.equal(Object.hasOwn(preferences, 'additionalArguments'), false);
  assert.equal(secureWebPreferences({ additionalArguments: 'not-an-array' }).additionalArguments, undefined);
});
