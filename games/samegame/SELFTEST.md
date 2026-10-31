# SELFTEST · 消灭同色方块

> 日期：2026-10-13（Asia/Shanghai）

## 1. 逻辑单测（node）

命令：`node tests/core-test.js`

结果：**43 passed, 0 failed**（校准关卡种子/目标后应保持全绿）

覆盖：

| 用例 | 内容 |
|------|------|
| match | 水平对、单格拒绝、L 形 |
| gravity | 列内沉底 + moved 差分 |
| compact | 空列左压 + shifted 差分 |
| score | `(n-2)²`、连击倍率表 |
| clear | 清空奖计入 |
| stone | 不可匹配 |
| hasMoves | 死局棋盘 / 活局 |
| seed | 同种子可复现；生成保证可玩 |
| levels | 12 关均可生成且有着法 |
| greedy | 关 1–3 贪心可达目标分 |

复跑：

```bash
cd games/samegame && node tests/core-test.js
```

## 2. 关卡模拟通关路径（描述）

### 关卡 1「新手热身」（seed 1001，8×8×3，目标 120）

1. 悬停找最大连通块（教程高亮同逻辑），首消通常可得上百分 → 已接近/超过目标  
2. 若未达标，继续消剩余大团；不限步  
3. 典型贪心：优先最大团，约十余步内可大幅超目标甚至接近全清  

### 关卡 2「小试牛刀」（seed 2002，9×9×3，目标 220）

1. 前几次消除建立连击窗口（≤3s）拿倍率  
2. 小团可留作搭桥，优先中大团  
3. 贪心最大团路径实测可超目标并可能全清拿 +1000  

### 关卡 6「障石试炼」（seed 6006，含 5 石块）

1. 石块不可点，规划时绕开；石块随列下落  
2. 先清石块旁同色，使列压缩后连通重组  
3. 目标 350；限 45 步 — 优先大团，避免碎步耗尽  

### 关卡 8「限步冲刺」（校准 seed 8075）

1. 步数紧，开局扫描最大两团，选能引发更多横连的一侧  
2. 保持连击；避免 2 连空消（0 分仍耗步）  
3. 目标 350 / 45 步 — 以中大团为主  

## 3. 性能与移动端

| 项 | 结论 |
|----|------|
| 盘面最大 15×18 | flood-fill O(RC) 单次可忽略 |
| 粒子上限 ~220 + 对象池 | 避免 GC 尖峰 |
| Canvas DPR 适配 | `devicePixelRatio` 缩放 |
| 触摸 | touchstart/move/end，`touch-action: none` 防滚动 |
| Audio | 首次手势 `resume()` AudioContext |
| 动画锁 | `inputLocked` + tween 队列，防状态撕裂 |

建议真机抽测：iOS Safari / Android Chrome 各开一局关 1 与关 5。

## 4. 问题与修复记录

| 问题 | 修复 |
|------|------|
| 高难关目标分相对贪心过高 | 搜索更优 seed + 下调目标分至可达成区间 |
| `file://` 下 fetch levels 失败 | `index.html` 内嵌 `window.__LEVELS__` 兜底 |
| 消除动画 pop 阶段 board 已为 null | pop tween 携带 `cell.color` 绘制缩放 |
| 下落前最终格提前显示 | move tween 全程 suppress 目标格并用 ghost 插值 |
| 开始游戏重复 `startLevel` | 合并为单次按 unlocked 开局 |
| jar1karp GPL | 仅读思路，未复制代码；自研 MIT 实现 |

## 5. 手动 UI 检查清单

- [ ] 主菜单 / 选关 / 说明可切换
- [ ] 关卡 HUD：分/目标/步数/连击/进度条
- [ ] 悬停高亮、消除粒子与震屏、飘分、连击字
- [ ] 通关解锁下一关；失败可重试
- [ ] 暂停菜单功能正常

