---
name: pdd-delist
description: 拼多多多店铺商品下架（ego 浏览器）。按 goods_id 清单或标题关键词枚举在售商品，逐条点「下架 / 申请下架」→ 处理确认/理由弹窗 → 切「已下架」按 ID 回读 → 关键词清零复核 → 落每日 md/JSON。默认 dry-run，真实下架需显式确认。Use when 用户说「下架」「停售」「把某批链接下线」「这几个 ID 下架」，或给关键词/ID 清单要求按店下线。Negative：不用于上架、改价、库存、删除商品、批量勾选下架；不代登录。
---

# pdd-delist — 多店铺商品下架

> 范围：**只下架**（普通下架 / 申请下架）。不做上架、改价、库存、删除、批量勾选。
> 下架 ≠ 删除：已下架商品可在「已下架」页签点「上架」恢复（会重新审核）。

## 安全默认

- `dryRun` 默认 **true**：只枚举、读状态、写“计划下架”记录，不点任何动作。
- 真实下架必须同时满足：
  1. `dryRun: false`
  2. `confirmDestructive: true`
  3. 用户已确认 ID/关键词清单与 `reason`
  4. **关键词模式 live 还要显式 `allowKeywordLive:true`**（防止一次批量下太多；日常请用 IDs 模式 live）
- 申请下架的 `reason` 只填用户确认过的中性文案（默认 `暂停销售`），**不编造业务理由**。

## 用法

```bash
node <skill目录>/run.mjs delist-config.json
```

```json
{
  "recordRoot": "D:/pdd-delist",
  "dryRun": true,
  "confirmDestructive": false,
  "reason": "暂停销售",
  "shops": [
    { "shop": "<店铺A>", "profile": "<profile-A>" }
  ],
  "ids": [],
  "keyword": "<标题关键词>"
}
```

- `ids` 和 `keyword` 二选一（都为空会预检失败）；也支持在 `shops[]` 里给**每店独立 ids/keyword**（优先于全局）
- `enumerateOnly:true`：只枚举/读状态/写枚举清单，不处理任何商品（验收、评审清单时用）
- `dryRun` 默认 true；真实下架需要 `dryRun:false` + `confirmDestructive:true`
- `ids` 模式：按 ID 逐个过滤、读取、处理
- `keyword` 模式：先按标题关键词查，**翻完所有页**枚举在售 ID，再去重
- 多店默认顺序执行（同一时刻只动一个店）

### 每店独立目标

```json
{
  "recordRoot": "D:/pdd-delist",
  "dryRun": false,
  "confirmDestructive": true,
  "shops": [
    { "shop": "<店铺A>", "profile": "<profile-A>", "ids": ["<A-ID1>", "<A-ID2>"] },
    { "shop": "<店铺B>", "profile": "<profile-B>", "keyword": "<B关键词>" }
  ]
}
```

- `shops[].ids` / `shops[].keyword` 优先于全局
- 多店 live 时每店可用自己的清单，不会跨店套用

## 配置字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `recordRoot` | `D:/pdd-delist` | 记录根目录；`root` 也可作别名 |
| `dryRun` | **true** | 只读计划；live 必须显式 false |
| `confirmDestructive` | false | live 必须 true |
| `allowKeywordLive` | false | 关键词 live 批量下架保护；必须显式 true |
| `reason` | `暂停销售` | 申请下架 textarea 文案 |
| `shops` | 必填 | `[{shop,profile,ids?,keyword?}]` |
| `ids` | — | 全局 ID 清单（字符串数组/逗号空格分隔） |
| `keyword` | — | 全局标题关键词 |
| `enumerateOnly` | false | 只枚举/写清单，不处理 |
| `only` | — | 只跑指定店铺 |
| `keepOpen` | false | 成功也保留页面 |
| `jobTimeoutSec` | 600 | 单店超时 |
| `ego` / `worker` / `runtimeDir` / `allowC` | 自动 | 同其他 pdd skill |

## 执行流程

1. 按 profile 找空间/建空间；打开商品列表；回读店铺名
2. 切「在售中」；清空商品ID/名称过滤
3. 枚举：
   - IDs：去重直接用
   - 关键词：填名称 → 回车 → 逐页读 `ID:` 行，翻完 `PGT_pagerItem` 所有页
4. 逐条：
   - 按商品 ID 过滤 → 读行状态（必须销售中）
   - 找行内叶子「下架」/「申请下架」
   - 普通下架：弹窗「确定下架商品」→ 确定
   - 申请下架：弹窗 → 其他原因 → textarea 填 reason → 提交
   - 切「已下架」→ 按 ID → 回读 `已下架`/审核中
   - 成功再处理下一条；失败即停
5. 关键词模式：全部完成后切「在售中+关键词」，翻完所有页，要求剩余 0
6. 写每日记录 md + JSON

## 输出

```
<recordRoot>/<店铺>/pdd-delist-<YYYY-MM-DD>.md
<recordRoot>/<店铺>/pdd-delist-enumerate-<YYYY-MM-DD>.md   # enumerateOnly
<recordRoot>/_runs/delist-<时间>/report.json
<recordRoot>/_runs/delist-<时间>/logs/<店铺>.log
<recordRoot>/_runs/delist-<时间>/results/<店铺>.json
```

- 同一天多次运行：`pdd-delist-<date>.md` **追加**，用 `---` + 运行时间分隔，不覆盖历史
- dry-run 的 `方式` 显示 `would_下架` / `would_申请下架`

md 表列：
`goods_id | 标题 | 原状态 | 方式（下架/申请下架/would_*） | 新状态 | 结果`
末尾汇总：请求/成功/待审核/dry-run/失败；关键词模式附清零复核。

## 状态 / 退出码

- `done`：执行完成（dry-run 也算 done）
- `pending_review`：申请下架后仍在审核（不算失败，记录里标出）
- `skip`：ID 找不到/已不在售
- `needs`：店铺未登录/店铺名不符/页面预算满
- `failed`：点击/弹窗/回读失败，立即停
- 总控：exit 3 预检 / 4 needs / 5 failed / 0 其余

## 关键判据

| 目标 | 判据 |
|---|---|
| 店铺名 | `body.innerText` 中「主账号」前 60 字含目标店铺 |
| 页签 | 可见叶子文本以 `在售中` / `已下架` 开头 |
| 商品ID 过滤 | 锚定叶子 `商品ID`，向上 8 层取该行 input（页面有两个同名 placeholder） |
| 商品名称 | `input[placeholder*="请输入商品名称"]` |
| 行状态 | 最深含 ID 叶子向上 8 层，命中 `销售中/已下架/审核中/发布中/已驳回/草稿` |
| 行内按钮 | 行容器内叶子文本精确等于 `下架` / `申请下架` |
| 普通确认 | `[class*=MDL_inner]` 含 `确定下架商品` → 叶子 `确定` |
| 申请下架 | 同上含 `下架原因` → `其他原因` → textarea → `提交` |
| 分页 | `li[class*=PGT_pagerItem]`，数字文本，`Active` 当前页 |

## 红线

1. 禁止批量勾选/批量下架；一次一行、按 ID 收窄
2. 逐条回读；未看到已下架/审核中即停
3. 理由不编造
4. 范围不扩大：只动用户给的 ID/关键词
5. 不代登录、不改价、不删商品
6. 下架 ≠ 删除，交付必须说明可恢复
7. 真实下架必须 `confirmDestructive:true`，默认 dry-run

## 常见坑

- 两个「多个查询」输入框：必须按 `商品ID` 标签锚定，不能取第一个
- 下架后行从「在售中」消失，不是点击失败；必须切「已下架」回读
- 申请下架 textarea 必填；不填点提交弹窗不关，容易误判成功
- 确定按钮是 `span` 不是 `button`
- 分页 10 条/页且没有「下一页」文本；必须点 `PGT_pagerItem` 数字翻页
- 关键词枚举后 tab 的 `(34)` 是店铺总在售数，不一定是过滤后的数；以实际翻页收集的 ID 为准
- 默认 profile 会变；显式 profileId + 回读店铺名
- Windows 跑 ego：写 `.mjs`，用 `ego-browser nodejs -e "await import('file:///...')"`；`-e` 只放 ASCII

## 测试边界

- 已用 dry-run 验证：关键词 `墙纸` 枚举 15 条/2 页；`自粘` 32 条/4 页；3 店 enumerateOnly 全部 done
- **live 已测 9 条**：单条申请下架（29.1s）、单条普通下架（26.1s）、**3 店 7 条多店 live**（2/2/3，全部 off_shelf，54.9/51/67.8s）
- 历史真实下架回归：2026-11-05 三店 41 条（旧脚本）
- 未测/非阻塞：关键词清零 live（默认禁用）

## 商品主档

真实下架成功后写入 `店铺运营日志/商品/<店铺>/<商品ID>/`，商品档案 `lifecycleStatus=已下架`。下架前 `assertCan`，已下架不再重复下架；dryRun 不落账。

## 首次使用

必须询问用户运营日志目录并配置 `ledgerRoot`；未配置返回 `ledger_root_required`，不默认 C 盘，不创建目录。
