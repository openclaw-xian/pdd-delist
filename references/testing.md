# 测试记录（pdd-delist）

> 2026-11-21。店铺匿名化为 A/B/C。

## 旧版历史真实下架

2026-11-05 旧脚本实跑三店 **41 条**，全部逐条回读「已下架」：

| 店铺 | 条数 | 方式 | 清零复核 |
|---|---|---|---|
| 店铺A | 22 | 1 申请 + 21 直接 | 在售中 0 |
| 店铺B | 10 | 2 申请 + 8 直接 | 在售中 0 |
| 店铺C | 9 | 1 申请 + 8 直接 | 在售中 0 |

## 新版 dry-run

| 用例 | 结果 |
|---|---|
| 店铺B，keyword=`墙纸` | 跨 **2 页**枚举 **15 个在售 ID**，49.3s，无真实动作 |
| 店铺B，keyword=`自粘`，enumerateOnly | **32 个 ID / 4 页**，21.4s |
| 3 店 keyword=`自粘`，enumerateOnly | 店铺B 33、店铺C 62、店铺A 50，全部 done；店铺A 9 标签页触发 `page_budget_recreate_space` 后自动重建成功 |
| 店铺B，ids=[1 个 ID] | 13s，读到 `on_sale`，记录 `would_申请下架` |
| 记录 | 生成 `pdd-delist-2026-11-21.md` / enumerate 清单 |

## 安全预检

| 用例 | 结果 |
|---|---|
| keyword + `dryRun:false` 未给 `allowKeywordLive` | `keyword_live_not_allowed`，exit 3，不打开浏览器 |

## live 实测

| 用例 | 结果 |
|---|---|
| 测试 ID 单条（申请下架） | `on_sale` → 申请下架 → `off_shelf` / unlisted，29.1s |
| 测试 ID 单条（普通下架） | `on_sale` → 下架 → `off_shelf` / unlisted，26.1s |
| 记录 | `D:/pdd-delist/碧竹家居/pdd-delist-2026-11-21.md` |

## 未测 / 非阻塞

- 关键词清零复核 live：**默认禁用**，非日常使用，不作为交付阻塞
- 多店串联 live
- 页面预算 needs（页面预算自动重建已在 enumerateOnly 验证）
