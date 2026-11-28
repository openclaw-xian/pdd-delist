# pdd-delist

拼多多多店铺商品下架（ego 浏览器）—— DeepSeek Harness (DSH) skill。

按 goods_id 清单或标题关键词枚举在售商品，逐条下架/申请下架，切「已下架」回读，关键词清零复核，落每日记录。

## 安全

默认 `dryRun: true`，只读枚举；真实下架必须 `dryRun:false` + `confirmDestructive:true`，且用户确认清单和 reason。

## 安装

复制/联接到 `~/.agents/skills/pdd-delist`。

## 用法

```bash
node run.mjs delist-config.json
```

```json
{
  "recordRoot": "<下架记录目录>",
  "dryRun": true,
  "confirmDestructive": false,
  "reason": "暂停销售",
  "shops": [{ "shop": "<店铺A>", "profile": "<profile-A>" }],
  "ids": [],
  "keyword": "<标题关键词>",
  "enumerateOnly": false
}
```

- `enumerateOnly:true`：只读枚举，不处理商品
- 每店可单独给目标：`shops:[{shop,profile,ids:["..."]},{shop,profile,keyword:"..."}]`；优先于全局 `ids/keyword`
- `dryRun:true`：只读计划；真实下架需 `dryRun:false` + `confirmDestructive:true`
- 关键词 live 会批量下架，默认被拦；确需批量必须显式 `allowKeywordLive:true`。日常 live 用 `ids` 模式。

## 输出

```
<recordRoot>/<店铺>/pdd-delist-<YYYY-MM-DD>.md
<recordRoot>/_runs/delist-<时间>/report.json
```

详细流程、选择器、坑、边界见 [SKILL.md](SKILL.md)。

## 首次使用

必须询问用户运营日志目录并配置 `ledgerRoot`；未配置返回 `ledger_root_required`，不默认 C 盘，不创建目录。

## 共享账本配置

首次指定 `ledgerRoot` 后会写入共享配置（默认 `%USERPROFILE%/.config/pdd/ledger.json`，可用 `PDD_LEDGER_CONFIG` 覆盖）。其他 skill 自动读取，不再重复询问；配置里只存目录指针，不存业务数据。

## 运行预期与退出码

- 单条约 25s，10 条约 4-5 分钟。
- 退出码：0 完成；3 预检；4 needs；5 失败。
- `allowKeywordLive:true` 用于防止关键词模式一次批量下太多；日常请用 IDs 模式。
