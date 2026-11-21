# 实现说明（pdd-delist）

## 结构

```
run.mjs            普通 Node 调度：预检 → 逐店 spawn worker（顺序）→ 汇总
worker-delist.mjs  ego 内：找店 → 枚举 → 逐条下架 → 回读 → 清零复核 → 记录
```

## 调度器

1. 读 config：recordRoot、shops、ids/keyword、dryRun、reason
2. 预检：
   - shops 非空
   - ids/keyword 至少一个
   - recordRoot 可写
   - 真实下架必须 `dryRun:false` + `confirmDestructive:true`
   - ego 可用
3. 逐店顺序执行（同一时刻只开一个店）
4. 汇总 report.json / summary.txt

## worker

1. 找店：profile → 已有 space；没有则按 profileId 建；打开商品列表；回读店铺名
2. 切「在售中」，清空两个过滤器
3. 枚举：
   - IDs：直接去重
   - 关键词：填名称 → Enter → 逐页点 `PGT_pagerItem` 数字 → 收 `ID:` 行，去重
4. 逐条：
   - 按 ID 过滤 → 读行（必须 `销售中`）
   - 找叶子 `下架` / `申请下架`
   - 普通：确认弹窗 → 确定
   - 申请：其他原因 → textarea → 提交
   - 切已下架 → 按 ID → 回读
   - 失败即停
5. 关键词模式：清零复核（在售中 + 关键词全页扫描，必须 0）
6. 写每日 md + JSON

## 分页算法

- 读 `li[class*=PGT_pagerItem]` 数字和 Active
- 收当前页；再点当前页+1，若不存在点最大可见页触发展开
- 最多 100 页；已访问页重复则停
- 没有「下一页」按钮，不能按文本找

## 状态

- `done`：执行完成（dry-run 也是）
- `pending_review`：申请下架后审核中
- `skip`：ID 不存在/已下架
- `needs`：登录/店铺名/页面预算
- `failed`：点击/弹窗/回读失败

## 改版维护

| 变的东西 | 改哪里 |
|---|---|
| 商品列表 URL | `openShop()` |
| 页签/分页 | `clickTab` / `enumeratePages` |
| ID/名称筛选 | `setGoodsId` / `setInputByPlaceholder` |
| 行状态/按钮 | `readRow` / `actionFor` |
| 普通/申请弹窗 | `normalFlow` / `applyFlow` |
| 记录格式 | `main()` 写 md |
