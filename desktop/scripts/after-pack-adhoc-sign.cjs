/**
 * after-pack-adhoc-sign.cjs —— electron-builder afterPack：macOS ad-hoc 重签名（无 Apple Developer 账号）。
 *
 * 依据计划 §4.3：仅 darwin；codesign --force --deep --sign -；随后校验签名。
 * 失败即让构建失败（不产出无法启动的 App）。注意：ad-hoc 签名**不能**通过 Gatekeeper，
 * spctl 拒绝是预期行为（验收不把 spctl 失败当缺陷；安装步骤见 desktop/README.md）。
 */
const { execFileSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (!context || context.electronPlatformName !== 'darwin') return;

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = context.appOutDir + '/' + productFilename + '.app';

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
};
