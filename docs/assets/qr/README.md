# 二维码：https://deadpan.asia/exam

中心嵌 `学习中.svg`（工作区根目录，1024×1024 彩色图标）。

| 文件 | 用途 |
|---|---|
| `deadpan-exam-qr.svg` | **首选**：矢量，任意尺寸不失真（印刷/海报/PPT） |
| `deadpan-exam-qr.png` | 1024×1024 位图（网页/微信/文档） |
| `deadpan-exam-qr@2x.png` | 2048×2048 位图（高清屏/大幅面） |
| `deadpan-exam-qr-transparent.svg/.png` | 透明底（**仅用于浅色背景**，深色底不要用） |

## 参数（为什么这么定）
- **内容**：`https://deadpan.asia/exam`
- **纠错等级 H（30%）** —— 中心被 logo 遮住约 4.8% 面积，H 级留足冗余。
- **logo 占边长 22%**，坐在 **28% 的白色圆角底垫**上：垫子比 logo 大一圈，既保证图标与二维码模块之间有静默间隔，又避免深色模块贴着彩色图形造成识别困难。
- **静默区 4 个模块**（`margin: 4`）：印刷与远距离扫描的标准要求。
- 纯黑模块 + 纯白背景（不用品牌色）：对比度最大化，扫码成功率优先。

## 扫码实测（jsQR 解码，全部通过）
| 尺寸 | 结果 |
|---|---|
| 1024×1024 与 2048×2048 | ✅ `https://deadpan.asia/exam` |
| 320 / 240 px | ✅ |
| **180 px** | ✅ |
| **120 px**（约 1.5cm 印刷宽度） | ✅ |
| 透明底（按白底合成后） | ✅ |

> 120px 仍能解出，说明中心 logo 没有吃掉必要模块；但实际使用建议 **≥ 180px（约 2cm）**，手机远距离扫码更稳。

## 复现命令
```bash
# 依赖装在临时目录，不进项目
mkdir -p /tmp/qr && cd /tmp/qr && npm init -y && npm i qrcode jsqr pngjs
# 生成（viewBox 是「模块」坐标，logo 覆盖层必须按 viewBox 计算，不能按 width/height）
node gen2.cjs
# 光栅化（借用 client 的 playwright）
node render2.mjs
# 解码自检
node decode2.cjs deadpan-exam-qr.png deadpan-exam-qr@2x.png small-240.png small-120.png
```
