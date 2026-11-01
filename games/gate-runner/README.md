# 数字门跑酷 · Gate Runner（PR2 · 十关战役）

Three.js 第三人称竖屏跑酷：自动前进、左右拖动、自动开火；射击左右数字门可抬高数值/改变门宽；穿门获得人数或火力；前方怪物可打，撞到扣人。含 **10 关**、**≥6 种怪物** 与 **Dragon Evolved Boss**（第 5 关迷你龙 + 第 10 关终局）。

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
| 按住路面 | 队长移到手指在路面上的位置，松手不回中 |
| ← → / A D | 每次 0.45 世界单位，方向跟屏幕 |
| 自动 | 前进与开火 |
| 音效按钮 | 静音，刷新后仍记住 |

## 关卡概要

| Lv | 主题 | 怪物 |
|----|------|------|
| 1 | 教程 | Zombie |
| 2 | 热身 ×门 | Zombie + half |
| 3 | 混战 | + Big arm |
| 4 | 火力 | Orc |
| 5 | 中段 | Demon + 迷你 Dragon Evolved |
| 6 | 压力 | Yeti + half |
| 7 | 近战轮转 | 全种类 |
| 8 | 精英 | Orc / Demon / Yeti |
| 9 | 冲刺补给 | 全种类 |
| 10 | 终局 | 混编 + 全血 Dragon Evolved |

星级：未通关 0★；通关 1★；通关且击杀达到敌人数 50%（向上取整）为 2★；通关且人数、火力、击杀（70%）都达到为 3★。只堆人数、不杀怪，最高 2★。

## 技术

- Three.js r170（jsDelivr import map）
- `EffectComposer` + `UnrealBloomPass`
- Fog + 自发光门；门数字 HTML 投影（仅最近 1–2 对）
- Quaternius CC0 glTF（见 `ATTRIBUTION.md`）

## 目录

```
games/gate-runner/
  index.html
  css/style.css
  js/main.js
  js/core.js
  js/audio.js
  data/levels.json
  data/level1.json      # L1 快照（兼容）
  assets/gltf/
  scripts/download-quaternius.sh
  ATTRIBUTION.md
  SELFTEST.md
```

## 自测

见 `SELFTEST.md`。逻辑冒烟：

```bash
node games/gate-runner/tests/core-test.mjs
```
