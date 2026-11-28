## 0.1.14 — 2026-11-28

- README 删除重复 dryRun 键，补耗时/退出码/allowKeywordLive 说明。

## 0.1.13 — 2026-11-27

- 脱敏：示例盘符路径改为占位。
- 默认路径从 `<旧默认路径>` 改为 `process.cwd()/pdd-delist`。
## 0.1.12 — 2026-11-27

- 读取共享账本配置；一个 skill 指定 `ledgerRoot` 后其他 skill 自动复用。
- 未配置时仍返回 `ledger_root_required`。

## 0.1.11 — 2026-11-27

- 首次使用必须指定 `ledgerRoot`，未配置返回 `ledger_root_required`，不再默认 C 盘。

## 0.1.10 — 2026-11-27

- 下架入口按目标商品加锁，拿不到锁直接失败。
- pending intent 任何未完成操作都拦截。

## 0.1.9 — 2026-11-27

- 修复下架入口未定义 `LEDGER_ROOT` 导致真实下架报错。
- 实测商品 1023569000338：dry-run `on_sale/would_申请下架`；真实下架 `off_shelf/unlisted`。
- 商品主档写入 `lifecycleStatus=已下架`；随后 `pdd-edit-goods` preflight 返回 `product_delisted`。

## 0.1.8 — 2026-11-27

- 同步加固版商品主档：未知状态/pending 拦截、原子写、事件重建、商品锁。

## 0.1.7 — 2026-11-27

- 接入商品主档：真实下架成功后写 `商品/<店铺>/<商品ID>/`，`lifecycleStatus=已下架`。
- 下架前调用 `assertCan`；已下架商品返回 `already_delisted`。
- 账本根目录 `ledgerRoot`，默认 `%USERPROFILE%/店铺运营日志`。

# Changelog

## 0.1.6 — 2026-11-21

- SKILL 增加完整配置字段表、每店独立 ids/keyword 示例。
- 输出说明补充 enumerateOnly 清单、每日记录追加不覆盖。
- 使用方法/口径/边界文档收口。

## 0.1.5 — 2026-11-21

- 支持 `shops[].ids` / `shops[].keyword`：每店独立目标，优先于全局。
- 多店 live 实测：3 店 7 条（2/2/3），全部申请下架 → off_shelf，54.9/51/67.8s。
- 记录按店追加，三店各自独立。

## 0.1.4 — 2026-11-21

- 关键词模式 live 默认拦截：`keyword_live_not_allowed`；防止一次批量下太多。
- 日常 live 推荐 IDs 模式；确需批量关键词下架需显式 `allowKeywordLive:true`。
- 文档/测试更新：关键词清零 live 不再作为日常验收项。

## 0.1.3 — 2026-11-21

- 普通下架路径 live 实测：测试 ID `988027547481` → `下架` → `off_shelf`，26.1s。
- 每日记录改为**追加**：同一天多次运行保留历次记录（`---` + 运行时间）。
- 文档更新 live 覆盖：申请下架 + 普通下架均已实测。

## 0.1.2 — 2026-11-21

- live 实测 1 条：测试 ID 申请下架 → 已下架 (off_shelf)，29.1s；记录落盘。
- 文档更新 live 验收状态；剩余未测：关键词清零 live、多店 live、普通下架新代码 live。

## 0.1.1 — 2026-11-21

- 新增 `enumerateOnly` 只读枚举（不处理商品），用于评审清单。
- 枚举翻页后按行容器补全标题，修复只读清单标题错位。
- 3 店 enumerateOnly 实测全部 done；9 标签页空间自动重建。
- 记录/测试补充 32 条 4 页、3 店 33/62/50 条。

## 0.1.0 — 2026-11-21

- 重构为独立 skill：run.mjs + worker-delist.mjs + config，多店顺序执行。
- 默认 dry-run；真实下架必须 confirmDestructive:true。
- IDs/关键词两种入口；关键词枚举翻完 PGT_pagerItem 所有页。
- 逐条：ID 过滤 → 行内下架/申请下架 → 确认/理由弹窗 → 已下架回读 → 失败即停。
- 关键词清零复核 + 每日 md/JSON 记录。
- dry-run 实测：关键词「墙纸」跨 2 页枚举 15 条；单 ID dry-run 正常。
- 保留历史真实下架回归证据（2026-11-05 三店 41 条）。
