# PR1 自测清单（合集门户 + SameGame 迁移 + Gate Runner）

完整条目见：

- `games/gate-runner/SELFTEST.md`
- `games/samegame/SELFTEST.md`（原根目录自测，路径已随迁移更新时请在该目录执行）

## 快速冒烟

```bash
python3 -m http.server 8080
# http://localhost:8080/                  门户
# http://localhost:8080/games/samegame/   SameGame
# http://localhost:8080/games/gate-runner/ Gate Runner

node games/samegame/tests/core-test.js
node games/gate-runner/tests/core-test.mjs
```

## PR 描述建议勾选

- [ ] SameGame 迁入 `games/samegame/` 仍可玩
- [ ] 根门户 Arcade 三栏可切换两款游戏
- [ ] Gate Runner Three.js 竖屏切片可完整体验一关并结算
- [ ] Quaternius 资源与 ATTRIBUTION 齐全
- [ ] 未把「下一关」做成可进（灰显占位）
