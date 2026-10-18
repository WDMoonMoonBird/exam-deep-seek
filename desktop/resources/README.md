# resources/

electron-builder 的 `buildResources` 目录（图标等构建期资源）。

## icon.icns

已内置应用图标 `icon.icns`（615 KB），来源：`client/resources/icon.png`（1024×1024，**只读**，未修改该文件）。

重新生成（源图更新后执行）：

```bash
rm -rf /tmp/deadpan.iconset && mkdir -p /tmp/deadpan.iconset
for spec in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
            128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 512:icon_256x256@2x \
            512:icon_512x512 1024:icon_512x512@2x; do
  size=${spec%%:*}; name=${spec##*:}
  sips -z "$size" "$size" client/resources/icon.png --out "/tmp/deadpan.iconset/$name.png" >/dev/null
done
iconutil -c icns /tmp/deadpan.iconset -o desktop/resources/icon.icns
```

配置入口：`electron-builder.yml` 的 `mac.icon: resources/icon.icns`；未提供时 electron-builder 会回退 Electron 默认图标。
