# Gate Runner · PR2 自测清单

> 用于 PR 描述与人工验收。环境：仓库根目录 `python3 -m http.server 8080`，Chrome/Edge，竖屏或窄窗。

## 结构 / 门户

- [ ] 根目录 `index.html` 为合集门户（左分类 / 中游玩 / 右推荐）
- [ ] 门户推荐区仍同时列出 **Gate Runner** 与 **SameGame**
- [ ] 门户可切换并 iframe 打开两款游戏
- [ ] `games/samegame/` 可独立游玩

## 十关 + 结算

- [ ] 加载后开始关卡 1；胜利结算「下一关」可点并进入第 2 关
- [ ] 失败时「下一关」仍禁用；重试回到当前关
- [ ] 星级：通关至少 1★；人数/火力阈值影响 2★/3★（结算有阈值说明）
- [ ] 第 10 关胜利文案体现终局通关；无「第 11 关」

## 怪物 / Boss

- [ ] 可见 ≥6 种：Zombie、Zombie half、Big arm、Orc、Demon、Yeti
- [ ] 第 5 关出现低血量迷你 Dragon Evolved；有攻击 / 受击 / 死亡动画反馈
- [ ] 第 10 关全血 Dragon Evolved Boss；击败后才能有效冲终点
- [ ] 相关关卡至少有一波可读的「迎面僵尸/怪物」走进镜头（体型/时机明显）

## PR1 跟进

- [ ] 竖屏第三人称：Sam **全身 + 枪** 入画（不是只见枪口一排）
  - Cam lock: `position (playerX*0.15, ~2.65, state.z-6.0)` · `lookAt(playerX, 1.42, state.z+0.85)` — lookAt Sam chest, not road ahead
  - Visible squad ≤4, side flanks only, lead-only compact rifle; gate floats single-slot; readableWave showcase holds ~9.2m ≥1.5s
- [ ] 门数字标签只显示最近 **1 对**（距离阈值内；远景不叠成地平线字墙）
- [ ] 隐藏 QA：`?level=5` / `?level=10` 可直达 Boss 关

## 画面质量（录屏 / 广告）

- [ ] 非昏暗脏灰：天空/雾偏亮，门有 Bloom 自发光
- [ ] 高架路面 + 警示边 + 城市远景可读
- [ ] 中文 HUD 正常

## 资源 / 合规

- [ ] `ATTRIBUTION.md` 含 Post Apocalypse + Ultimate Monsters CC0 与 poly.pizza 链接
- [ ] `assets/gltf/` 含 orc / demon / yeti / dragon-evolved
- [ ] `scripts/download-quaternius.sh` 可按 manifest 重下

## 技术冒烟

- [ ] `node games/gate-runner/tests/core-test.mjs` 通过
- [ ] 浏览器控制台无持续报错（允许首屏 CDN 慢）
