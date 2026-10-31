# Gate Runner · PR1 自测清单

> 用于 PR 描述与人工验收。环境：`python3 -m http.server 8080`，Chrome/Edge，竖屏或窄窗。

## 结构 / 门户

- [ ] 根目录 `index.html` 为合集门户（左分类 / 中游玩 / 右推荐）
- [ ] 门户可切换并 iframe 打开 SameGame 与 Gate Runner
- [ ] `games/samegame/` 可独立游玩（旧根路径玩法未丢）
- [ ] `legacy/samegame.html` 可跳转到 `games/samegame/`

## Gate Runner 玩法切片

- [ ] 加载屏结束后可点「开始关卡 1」
- [ ] 角色自动向前跑；左右拖动跟手且不冲出路面
- [ ] 自动开火，子弹可见；打中门后数字变化 / 门有发光
- [ ] 穿过增益门后 HUD「人数」或逻辑奖励变化
- [ ] 至少可见 2 种僵尸模型（Zombie / Zombie half 或 Big arm），有行走/受击/死亡动画或可见反馈
- [ ] 撞到僵尸会扣人数；人数归零进入失败结算
- [ ] 到达终点门：人数足够→胜利结算；不足→失败
- [ ] 结算面板含分数 / 击杀 / 人数、星级占位、重试可用、「下一关」灰显禁用

## 画面质量（录屏）

- [ ] 非昏暗脏灰：天空/雾偏亮，门有 Bloom 自发光
- [ ] 高架路面 + 警示边 + 城市远景可读
- [ ] 竖屏构图第三人称（相机在角色后方偏上）

## 资源 / 合规

- [ ] `ATTRIBUTION.md` 写明 Quaternius CC0 与 poly.pizza 来源
- [ ] `assets/gltf/` 含 Sam + ≥2 僵尸 + 街道/路障/桶等
- [ ] `scripts/download-quaternius.sh` 可依据 manifest 重下

## 技术冒烟

- [ ] 浏览器控制台无持续报错（允许首屏 CDN 慢）
- [ ] 不执行 `git push` 以外的发布步骤时，本地静态服务即可玩
