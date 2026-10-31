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
- [ ] 第 5 关出现低血量迷你 Dragon Evolved（~2.2 高）；有攻击 / 受击 / 死亡动画反馈
- [ ] 第 10 关全血 Dragon Evolved Boss（~3.2 高，远距生成）；击败后才能有效冲终点
- [ ] 相关关卡至少有一波可读的「迎面僵尸/怪物」走进镜头（体型/时机明显）
- [ ] 怪物站在路面上（Box3.min.y≈0），不是埋地 / 空路只涨击杀

## PR1 跟进（PR2 hard-fail 修复）

- [ ] 竖屏第三人称：Sam **全身** 入画（hide bind-pose Axe/weapons；lead 右手 tiny primitive；无独立 rifle / 无 roadside barrel）
  - Cam lock: `position (playerX*0.08, 2.35, state.z-6.2)` · `lookAt(playerX, 1.25, state.z+0.35)` · near=0.35 · fov=50
  - Visible squad ≤3, side flanks only; re-ground `y=groundY` every frame; SkeletonUtils.clone
  - Gate: nearest 1 pair HTML **and** 3D panels; combat floats single-slot (no `-2-2-2`)
  - readableWave lazy-activate when event within 14m → pin `state.z+8.5` ≥1.6s, height ~2.2, fire hush + invuln
  - Boss: mini≤1.8 / finale≤2.4, wingspan≤1.1×h; spawn `max(event.z, state.z+22)`; `?level=10` hide until z>8
  - Road: street Z overlap + asphalt underlay; no barrel.glb props
- [ ] 门数字标签只显示最近 **1 对**（远景 3D 面板一并隐藏）
- [ ] 隐藏 QA：`?level=5` / `?level=10` 可直达 Boss 关；`?debug=1` 显示 cam + 首敌 min.y（及 `window.__grDbg`）

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

## 残差风险

- Sam/怪物朝向依赖 Quaternius 默认 +Z；若某资源朝向相反，需单资源覆写 `rotation.y`
- 无 WebGL 截图时用 `?debug=1` 核对 grounding；总监录屏仍是最终验收
- Boss 用 height fit + wingspan cap（≤height×1.1）；readableWave lazy pin 8.5m；Sam 武器网格默认隐藏
- Headless SwiftShader 材质可能发灰/显瘦，不以无头浏览器截图替代总监验收
