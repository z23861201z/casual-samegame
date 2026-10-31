# 数字门跑酷 · Gate Runner（PR1 竖屏切片）

Three.js 第三人称竖屏跑酷：自动前进、左右拖动、自动开火；射击左右数字门可抬高数值/改变门宽；穿门获得人数或火力；前方僵尸可打，撞到扣人。

## 本地打开

必须用静态服务器（ESM + glTF）：

```bash
# 在仓库根目录
python3 -m http.server 8080
```

然后打开：

- 合集门户：http://localhost:8080/
- 本游戏：http://localhost:8080/games/gate-runner/

## 操作

| 输入 | 作用 |
|------|------|
| 拖动 / 滑动 | 左右移动 |
| ← → / A D | 左右微调 |
| 自动 | 前进与开火 |

## 技术

- Three.js r170（jsDelivr import map）
- `EffectComposer` + `UnrealBloomPass`
- Fog + 自发光门
- Quaternius CC0 glTF（见 `ATTRIBUTION.md`）

## 目录

```
games/gate-runner/
  index.html
  css/style.css
  js/main.js          # 场景 / 输入 / 循环
  js/core.js          # 纯逻辑
  data/level1.json
  assets/gltf/
  scripts/download-quaternius.sh
  ATTRIBUTION.md
  SELFTEST.md
```

## 自测

见 `SELFTEST.md`。逻辑冒烟：

```bash
node --input-type=module -e "import('./js/core.js').then(m=>console.log(m.applyGate(3,1,{op:'add',value:8})))"
```
