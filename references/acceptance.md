# 验收清单

## 必须

- [x] config 驱动、多店顺序
- [x] IDs/关键词两种入口
- [x] 关键词翻页枚举（实测 15 条/2 页、自粘 32 条/4 页）
- [x] 3 店 enumerateOnly 全部 done（33/62/50）+ 9 标签页自动重建
- [x] 逐条 ID 过滤 + 行状态读取
- [x] 普通下架/申请下架弹窗处理
- [x] 已下架回读
- [x] 关键词清零复核（代码）
- [x] 每日 md + JSON
- [x] dry-run 默认；live 需 confirmDestructive
- [x] needs/exit code
- [x] 无真实店铺名/个人路径

## 走查

1. 先 dry-run：关键词/ID，检查 md 只出现 `would_*`
2. 确认清单和 reason
3. 设 `dryRun:false` + `confirmDestructive:true`
4. 先跑 1 个测试 ID live
5. 检查「已下架」回读 + md
6. 再批量

## 记录

- dry-run：15 条跨 2 页，49.3s；单 ID 13s
- live：测试 ID 申请下架 → 已下架，29.1s
- 旧版真实下架：2026-11-05 三店 41 条
- 新版 live：已测 1 条申请下架
