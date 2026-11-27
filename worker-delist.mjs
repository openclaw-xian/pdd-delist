// worker-delist.mjs — 单店铺商品下架（ego 内）
const fs = await import("node:fs/promises");
const path = await import("node:path");

const JOB = globalThis.__JOB || {};
const T0 = Date.now();
const logs = [];
const log = (...a) => {
  const line = "[t=" + ((Date.now() - T0) / 1000).toFixed(1) + "s] " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  logs.push(line); console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let task = null, page = null;
const RECORD_DIR = (JOB.recordRoot || path.join(process.cwd(), "pdd-delist")).replace(/\\/g, "/").replace(/\/$/, "") + "/" + JOB.shop;

function localStamp() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19) + " +08:00";
}
function today() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }

async function writeResult(obj) {
  const out = { ...obj, shop: JOB.shop, elapsedSec: Number(((Date.now() - T0) / 1000).toFixed(1)) };
  if (JOB.resultPath) await fs.writeFile(JOB.resultPath, JSON.stringify(out, null, 1), "utf8").catch(() => {});
  if (JOB.logPath) await fs.writeFile(JOB.logPath, logs.join("\n"), "utf8").catch(() => {});
  return out;
}

async function newPageSafe() {
  const tabs = await task.tabs().catch(() => []);
  if (tabs.length >= 8) throw new Error("page_budget_full:" + tabs.length);
  return task.newPage();
}

async function readShop() {
  return page.evaluate(() => {
    const t = document.body.innerText || "";
    const i = t.indexOf("主账号");
    return i >= 0 ? t.slice(Math.max(0, i - 60), i + 8) : "";
  }).catch(() => "");
}

async function openShop() {
  async function makePage() {
    const ps = await profiles();
    const p = ps.find((x) => String(x.name || "") === String(JOB.profile || ""));
    if (!p) throw new Error("shop_not_logged_in:profile=" + JOB.profile);
    task = await taskSpace("pdd-delist-" + JOB.shop + "-" + Date.now(), { profileId: p.id });
    page = await newPageSafe();
  }
  const spaces = await listTaskSpaces();
  let entry = spaces.find((s) => String(s.profileName || "") === String(JOB.profile || ""));
  if (entry) {
    task = entry.ownership === "user" ? await claimTaskSpace(entry.id)
      : entry.ownership === "agentDelegatedToUser" ? await takeOverTaskSpace(entry.id)
      : await taskSpace(entry.id);
    try {
      page = await newPageSafe();
    } catch (e) {
      if (!/page_budget_full/.test(String(e.message || e))) throw e;
      log("page_budget_recreate_space", String(e.message || e));
      try { await task.finish({ keep: [] }); } catch (e2) {}
      task = null; page = null;
      await makePage();
    }
  } else {
    await makePage();
  }
  await page.goto("https://mms.pinduoduo.com/goods/goods_list", { timeout: 60000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const shopArea = await readShop();
  log("shop_area", shopArea.slice(-40));
  if (!shopArea.includes(JOB.shop)) throw new Error("shop_mismatch:" + shopArea.slice(-40) + " expected=" + JOB.shop);
}

const helpers = {
  async setInputByPlaceholder(part, value) {
    return page.evaluate(({ part, value }) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inp = [...document.querySelectorAll("input")].find((e) => vis(e) && (e.placeholder || "").includes(part));
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, value);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.focus();
      return true;
    }, { part, value });
  },
  async setGoodsId(id) {
    return page.evaluate((gid) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const labels = [...document.querySelectorAll("*")].filter((e) => vis(e) && !e.children.length && (e.textContent || "").trim() === "商品ID");
      let inp = null;
      for (const lab of labels) {
        let row = lab;
        for (let i = 0; i < 8 && row; i++) {
          row = row.parentElement;
          if (!row) break;
          const cands = [...row.querySelectorAll("input")].filter((x) => vis(x) && x.type !== "checkbox" && x.type !== "radio");
          if (cands.length) { inp = cands[0]; break; }
        }
        if (inp) break;
      }
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, gid);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.focus();
      return true;
    }, id);
  },
  async clickTab(name) {
    return page.evaluate((n) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const leaf = [...document.querySelectorAll("*")].find((e) => vis(e) && !e.children.length && new RegExp("^" + n).test((e.textContent || "").trim()));
      if (!leaf) return null;
      const r = leaf.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, name).then((p) => p ? page.mouse.click(p.x, p.y) : false);
  },
  async activeTabText() {
    return page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const tabs = [...document.querySelectorAll("*")].filter((e) => vis(e) && !e.children.length && /^(在售中|已下架|全部)/.test((e.textContent || "").trim()));
      const active = tabs.find((e) => /active|Active/i.test(String(e.className)) || /active|Active/i.test(String(e.parentElement && e.parentElement.className)));
      return active ? (active.textContent || "").trim() : "";
    });
  },
  async pagerState() {
    return page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = (e) => (e ? (e.textContent || "").trim() : "");
      const items = [...document.querySelectorAll("li")].filter((e) => /PGT_pagerItem/.test(String(e.className))).map((e) => ({ text: txt(e), active: /Active/.test(String(e.className)) }));
      const nums = items.map((i) => Number(i.text)).filter((n) => Number.isFinite(n));
      const active = items.find((i) => i.active);
      return { items, nums, active: active ? Number(active.text) : null, max: nums.length ? Math.max(...nums) : 0 };
    });
  },
  async listRows() {
    return page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = (e) => (e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "");
      const anchors = [...document.querySelectorAll("*")].filter((e) => vis(e) && !e.children.length && /ID:\s*\d{8,}/.test(txt(e)));
      const rows = [];
      for (const a of anchors) {
        const id = (txt(a).match(/ID:\s*(\d{8,})/) || [])[1];
        if (!id) continue;
        let n = a, row = null;
        for (let i = 0; i < 8 && n; i++) {
          n = n.parentElement; if (!n) break;
          const t = txt(n);
          if (/销售中|已下架|草稿|审核中|发布中|已驳回/.test(t)) { row = t; break; }
        }
        if (!row) continue;
        const status = /销售中/.test(row) ? "on_sale" : /已下架/.test(row) ? "off_shelf" : /已驳回|驳回/.test(row) ? "rejected" : /草稿/.test(row) ? "draft" : /审核中|发布中/.test(row) ? "auditing" : "unknown";
        rows.push({ id, status, applyOnly: /申请下架/.test(row), title: row.split("ID:")[0].slice(0, 80) });
      }
      const uniq = {};
      rows.forEach((r) => { if (!uniq[r.id]) uniq[r.id] = r; });
      if (!Object.keys(uniq).length) {
        const body = (document.body.innerText || "").replace(/\s+/g, " ");
        const re = /ID:\s*(\d{8,})/g;
        let m;
        while ((m = re.exec(body)) !== null) {
          const seg = body.slice(Math.max(0, m.index - 100), m.index + 260);
          const status = /销售中/.test(seg) ? "on_sale" : /已下架/.test(seg) ? "off_shelf" : /审核中|发布中/.test(seg) ? "auditing" : "unknown";
          if (!uniq[m[1]]) uniq[m[1]] = { id: m[1], status, applyOnly: /申请下架/.test(seg), title: seg.split("ID:")[0].slice(0, 80) };
        }
      }
      return Object.values(uniq);
    });
  },
  async readRow(id) {
    return page.evaluate((gid) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = (e) => (e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "");
      const anchor = [...document.querySelectorAll("*")].find((e) => vis(e) && !e.children.length && txt(e).includes(gid));
      if (!anchor) return { found: false };
      let n = anchor, row = null;
      for (let i = 0; i < 8 && n; i++) {
        n = n.parentElement; if (!n) break;
        const t = txt(n);
        if (/销售中|已下架|草稿|审核中|发布中|已驳回/.test(t)) { row = t; break; }
      }
      if (!row) return { found: true, status: "no_status" };
      const status = /销售中/.test(row) ? "on_sale" : /已下架/.test(row) ? "off_shelf" : /已驳回|驳回/.test(row) ? "rejected" : /草稿/.test(row) ? "draft" : /审核中|发布中/.test(row) ? "auditing" : "unknown";
      return { found: true, status, title: row.split("ID:")[0].slice(0, 80) };
    }, id);
  },
  async actionFor(id) {
    return page.evaluate((gid) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = (e) => (e ? (e.innerText || e.textContent || "").trim() : "");
      const anchor = [...document.querySelectorAll("*")].find((e) => vis(e) && !e.children.length && txt(e).includes(gid));
      if (!anchor) return { ok: false, why: "no_anchor" };
      let n = anchor, row = null;
      for (let i = 0; i < 8 && n; i++) {
        n = n.parentElement; if (!n) break;
        if (/销售中/.test(txt(n))) { row = n; break; }
      }
      if (!row) return { ok: false, why: "no_row" };
      const leaves = [...row.querySelectorAll("*")].filter((e) => vis(e) && !e.children.length);
      const apply = leaves.find((e) => txt(e) === "申请下架");
      const normal = leaves.find((e) => txt(e) === "下架");
      const btn = apply || normal;
      if (!btn) return { ok: false, why: "no_btn" };
      const r = btn.getBoundingClientRect();
      return { ok: true, label: txt(btn), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, id);
  },
};

async function gotoPage(n) {
  const ok = await page.evaluate((num) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const li = [...document.querySelectorAll("li")].find((e) => /PGT_pagerItem/.test(String(e.className)) && (e.textContent || "").trim() === String(num));
    if (!li) return false;
    li.click();
    return true;
  }, n);
  if (!ok) return false;
  await page.waitForTimeout(2500);
  return true;
}

async function enumeratePages() {
  const collected = new Map();
  let lastActive = 0;
  for (let step = 0; step < 100; step++) {
    const pager = await helpers.pagerState();
    const active = pager.active || 1;
    if (active === lastActive && step > 0) break;
    lastActive = active;
    const rows = await helpers.listRows();
    for (const r of rows) {
      if (collected.has(r.id)) continue;
      const rr = await helpers.readRow(r.id);
      collected.set(r.id, rr.found ? { id: r.id, status: rr.status, title: rr.title || r.title || "", applyOnly: r.applyOnly } : r);
    }
    let next = pager.nums.find((n) => n === active + 1);
    if (!next) next = pager.nums.find((n) => n > active);
    if (!next) break;
    if (!(await gotoPage(next))) break;
  }
  return [...collected.values()];
}

async function clearFilters() {
  await helpers.setGoodsId("");
  await helpers.setInputByPlaceholder("请输入商品名称", "");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
}

async function queryKeyword(keyword) {
  await helpers.setGoodsId("");
  await helpers.setInputByPlaceholder("请输入商品名称", keyword);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
}

async function openTab(name) {
  await helpers.clickTab(name);
  await page.waitForTimeout(3000);
}

async function dialogByText(text) {
  return page.evaluate((t) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (e) => (e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "");
    const boxes = [...document.querySelectorAll("[class*=MDL_inner]")].filter(vis);
    const box = boxes.find((e) => txt(e).includes(t));
    if (!box) return null;
    return { text: txt(box).slice(0, 200) };
  }, text);
}

async function clickDialogLeaf(dialogText, leafText) {
  const hit = await page.evaluate(({ dialogText, leafText }) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (e) => (e ? (e.innerText || e.textContent || "").trim() : "");
    const boxes = [...document.querySelectorAll("[class*=MDL_inner]")].filter(vis);
    const box = boxes.find((e) => txt(e).includes(dialogText));
    if (!box) return { ok: false, why: "no_dialog" };
    const leaves = [...box.querySelectorAll("*")].filter((e) => vis(e) && !e.children.length);
    const b = leaves.find((e) => txt(e) === leafText);
    if (!b) return { ok: false, why: "no_leaf" };
    const r = b.getBoundingClientRect();
    return { ok: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, { dialogText, leafText });
  if (!hit.ok) return hit;
  await page.mouse.click(hit.x, hit.y);
  return { ok: true };
}

async function applyFlow(reason) {
  const r1 = await clickDialogLeaf("下架原因", "其他原因");
  if (!r1.ok) return r1;
  await sleep(700);
  const r2 = await page.evaluate((text) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (e) => (e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "");
    const boxes = [...document.querySelectorAll("[class*=MDL_inner]")].filter(vis);
    const box = boxes.find((e) => txt(e).includes("下架原因"));
    if (!box) return { ok: false, why: "no_dialog_after_reason" };
    const ta = [...box.querySelectorAll("textarea")].find(vis);
    if (!ta) return { ok: false, why: "no_textarea" };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }, reason);
  if (!r2.ok) return r2;
  await sleep(500);
  const r3 = await clickDialogLeaf("下架原因", "提交");
  if (!r3.ok) return r3;
  await page.waitForTimeout(4500);
  const still = await dialogByText("下架原因");
  return still ? { ok: false, why: "dialog_not_closed" } : { ok: true };
}

async function normalFlow() {
  const r = await clickDialogLeaf("确定下架商品", "确定");
  if (!r.ok) return r;
  await page.waitForTimeout(2800);
  const still = await dialogByText("确定下架商品");
  return still ? { ok: false, why: "dialog_not_closed" } : { ok: true };
}

async function verifyId(id) {
  await openTab("已下架");
  await clearFilters();
  await helpers.setGoodsId(id);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2200);
  const r = await helpers.readRow(id);
  await openTab("在售中");
  return r;
}

async function main() {
  await openShop();
  await openTab("在售中");
  await clearFilters();

  let ids = (JOB.ids || []).map(String).filter(Boolean);
  let enumRows = [];
  const keyword = String(JOB.keyword || "").trim();
  if (!ids.length && keyword) {
    await queryKeyword(keyword);
    enumRows = await enumeratePages();
    ids = enumRows.filter((r) => r.status === "on_sale").map((r) => r.id);
    log("enumerated", JSON.stringify({ keyword, rows: enumRows.length, ids: ids.length }));
  }
  if (!ids.length) {
    return { status: "done", result: "nothing_to_do", ids: [], keyword };
  }
  if (JOB.enumerateOnly) {
    await fs.mkdir(RECORD_DIR, { recursive: true }).catch(() => {});
    const mdPath = RECORD_DIR + "/pdd-delist-enumerate-" + today() + ".md";
    const lines = [
      "# 商品枚举（只读） · " + JOB.shop + " · " + today(),
      "",
      "| goods_id | 标题 | 状态 | 可申请下架 |",
      "|---|---|---|---|",
      ...(enumRows.length ? enumRows.map((r) => "| " + r.id + " | " + (r.title || "").replace(/\|/g, "\\|").slice(0, 50) + " | " + r.status + " | " + (r.applyOnly ? "是" : "否") + " |") : ids.map((id) => "| " + id + " | - | unknown | - |")),
      "",
      "## 汇总",
      "- 关键词：" + keyword,
      "- 在售 ID：" + ids.length,
    ];
    await fs.writeFile(mdPath, lines.join("\n"), "utf8");
    return { status: "done", mode: "enumerate", requested: ids.length, ids, record: mdPath, enumerated: enumRows };
  }

  const plans = [];
  const records = [];
  for (const id of ids) {
    await helpers.setGoodsId(id);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2200);
    const before = await helpers.readRow(id);
    log("before", JSON.stringify({ id, before }));
    if (!before.found || before.status !== "on_sale") {
      records.push({ id, title: before.title || "", before: before.status || "not_found", action: "-", after: "-", result: "skip" });
      continue;
    }
    const act = await helpers.actionFor(id);
    if (!act.ok) {
      records.push({ id, title: before.title || "", before: before.status, action: "?", after: "-", result: "failed", why: act.why });
      break;
    }
    if (JOB.dryRun) {
      records.push({ id, title: before.title || "", before: before.status, action: "would_" + act.label, after: "-", result: "dry_run" });
      plans.push(id);
      continue;
    }
    await page.mouse.click(act.x, act.y);
    await page.waitForTimeout(1200);
    const flow = act.label === "下架" ? await normalFlow() : await applyFlow(JOB.reason || "暂停销售");
    if (!flow.ok) {
      records.push({ id, title: before.title || "", before: before.status, action: act.label, after: "dialog_" + flow.why, result: "failed" });
      break;
    }
    const after = await verifyId(id);
    const ok = after.status === "off_shelf" || after.status === "auditing";
    records.push({
      id, title: before.title || "", before: before.status, action: act.label,
      after: after.status || "not_found",
      result: ok ? (after.status === "off_shelf" ? "unlisted" : "pending_review") : "failed",
    });
    if (!ok) break;
  }

  // 若为关键词，做在售中清零复核
  let zeroCheck = null;
  if (keyword && !JOB.dryRun) {
    await openTab("在售中");
    await clearFilters();
    await queryKeyword(keyword);
    const rows = await enumeratePages();
    const remain = rows.filter((r) => r.status === "on_sale");
    zeroCheck = { keyword, remaining: remain.length, ids: remain.slice(0, 20).map((r) => r.id) };
    log("zero_check", JSON.stringify(zeroCheck));
  }

  // 记录
  await fs.mkdir(RECORD_DIR, { recursive: true }).catch(() => {});
  const date = today();
  const mdPath = RECORD_DIR + "/pdd-delist-" + date + ".md";
  const lines = [
    "# 商品下架记录 · " + JOB.shop + " · " + date,
    "",
    "| goods_id | 标题 | 原状态 | 方式 | 新状态 | 结果 |",
    "|---|---|---|---|---|---|",
    ...records.map((r) => "| " + r.id + " | " + (r.title || "").replace(/\|/g, "\\|").slice(0, 40) + " | " + r.before + " | " + (r.action || "-") + " | " + (r.after || "-") + " | " + r.result + " |"),
    "",
    "## 汇总",
    "- 请求：" + ids.length,
    "- 成功下架：" + records.filter((r) => r.result === "unlisted").length,
    "- 待审核：" + records.filter((r) => r.result === "pending_review").length,
    "- dry-run：" + records.filter((r) => r.result === "dry_run").length,
    "- 失败：" + records.filter((r) => r.result === "failed").length,
  ];
  if (zeroCheck) lines.push("", "## 清零复核", "- 在售中 + 关键词「" + keyword + "」剩余：" + zeroCheck.remaining + "（要求 0）");
  lines.push("", "> 下架 ≠ 删除；可在「已下架」点「上架」恢复（会重新审核）。");
  let prefix = "";
  try { await fs.access(mdPath); prefix = "\n\n---\n\n## 运行 " + localStamp() + "\n\n"; } catch (e) {}
  await fs.appendFile(mdPath, prefix + lines.join("\n"), "utf8");
  return {
    status: "done",
    mode: JOB.dryRun ? "dry_run" : "live",
    record: mdPath,
    requested: ids.length,
    records,
    zeroCheck,
    plans,
  };
}

let result;
try {
  const r = await main();
  result = r;
  await writeResult({ ok: true, ...r });
} catch (e) {
  const msg = String((e && e.message) || e);
  log("ERROR", msg);
  result = { status: "failed", error: msg };
  if (msg.includes("shop_mismatch") || msg.includes("shop_not_logged_in")) {
    result.needs = { code: "shop_not_logged_in", question: "请确认 ego 的 " + JOB.profile + " profile 已登录并对应店铺「" + JOB.shop + "」。" };
  } else if (msg.includes("page_budget_full")) {
    result.needs = { code: "page_budget_full", question: "店铺空间标签页已满，请关闭多余标签页后重跑。" };
  }
  await writeResult({ ok: false, ...result });
} finally {
  const keep = JOB.keepOpen === true || (result && result.status === "failed");
  if (task && keep) console.log("PAGE_LEFT_OPEN=1");
  else { try { if (task) await task.finish({ keep: [] }); } catch (e) {} }
}
console.log("WORKER_RESULT=" + JSON.stringify({ shop: JOB.shop, status: result && result.status, requested: result && result.requested, mode: result && result.mode }));
