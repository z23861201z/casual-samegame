# Casual Arcade · 休闲小游戏合集

本仓库现为**合集门户 + 多游戏**：

| 游戏 | 路径 | 说明 |
|------|------|------|
| **Gate Runner** 数字门跑酷 | [`games/gate-runner/`](games/gate-runner/) | Three.js 竖屏切片：射门、撞门加人、打僵尸 |
| **SameGame** 消灭同色方块 | [`games/samegame/`](games/samegame/) | 经典同色连通消除（已从仓库根目录迁入） |

## 本地打开

```bash
cd casual-samegame
python3 -m http.server 8080
```

浏览器访问：

- 合集门户：http://localhost:8080/
- Gate Runner：http://localhost:8080/games/gate-runner/
- SameGame：http://localhost:8080/games/samegame/

> Gate Runner 依赖 ESM import map 与 glTF，**请勿**用 `file://` 直接打开。

## 目录结构

```
casual-samegame/
  index.html              # Arcade Whale 风格合集门户
  css/portal.css
  legacy/samegame.html    # 旧入口跳转
  games/samegame/         # 原根目录 SameGame
  games/gate-runner/      # PR1 新游戏
  PR1-SELFTEST.md
  README.md
```

## 自测

见 [`PR1-SELFTEST.md`](PR1-SELFTEST.md) 与各游戏目录下 `SELFTEST.md`。

```bash
node games/samegame/tests/core-test.js
node games/gate-runner/tests/core-test.mjs
```

## 许可

代码 MIT。Gate Runner 角色/场景模型来自 Quaternius Post Apocalypse Pack（CC0），详见 `games/gate-runner/ATTRIBUTION.md`。
