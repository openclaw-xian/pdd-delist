// run.mjs — 多店商品下架调度（默认 dry-run）
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveLedgerRoot, assertCan, recordResult } from "./product-ledger.mjs";
import os from "node:os";
import path from "node:path";

const CFG_PATH = process.argv[2];
if (!CFG_PATH) { console.error("用法: node run.mjs <delist-config.json>"); process.exit(2); }
const CFG = JSON.parse(await fs.readFile(CFG_PATH, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOME = os.homedir();
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER = String(CFG.worker || path.join(SELF_DIR, "worker-delist.mjs")).replace(/\\/g, "/");
const RECORD_ROOT = String(CFG.recordRoot || CFG.root || "D:/pdd-delist").replace(/\\/g, "/").replace(/\/$/, "");
const LEDGER_ROOT = resolveLedgerRoot(CFG);
const EGO = String(CFG.ego || path.join(HOME, ".local", "share", "ego", "active_version_dir", "ego-browser.exe")).replace(/\\/g, "/");
const RUNTIME = String(CFG.runtimeDir || path.join(os.tmpdir(), "pdd-delist-runtime")).replace(/\\/g, "/").replace(/\/$/, "");
const RUN_ID = "delist-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const RUN_DIR = path.join(RECORD_ROOT, "_runs", RUN_ID);
const RESULT_DIR = path.join(RUN_DIR, "results");
const LOG_DIR = path.join(RUN_DIR, "logs");
const DRYRUN = CFG.dryRun !== false; // 默认只读，防止误操作

const issues = [];
const addIssue = (code, question, extra = {}) => issues.push({ code, question, ...extra });
function parseIds(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || "").split(/[\s,，]+/).map((x) => x.trim()).filter(Boolean);
}
const shops = (CFG.shops || []).map((s) => (typeof s === "string" ? { shop: s } : s)).filter((s) => s && s.shop)
  .map((s) => ({
    ...s,
    _hasIds: s.ids !== undefined,
    _ids: parseIds(s.ids),
    _hasKeyword: s.keyword !== undefined,
    _keyword: String(s.keyword || "").trim(),
  }));
const only = CFG.only && CFG.only.length ? CFG.only : null;
const useShops = only ? shops.filter((s) => only.includes(s.shop)) : shops;
const ids = parseIds(CFG.ids);
const keyword = String(CFG.keyword || "").trim();
const shopHasTarget = useShops.some((s) => (s._hasIds && s._ids.length) || (s._hasKeyword && s._keyword));
const anyKeyword = !!keyword || useShops.some((s) => s._hasKeyword && s._keyword);

if (!shops.length) addIssue("shops_missing", "config 需要 shops");
if (!useShops.length) addIssue("no_store_selected", "only 过滤后没有店铺");
if (!ids.length && !keyword && !shopHasTarget) addIssue("target_missing", "config 需要全局 ids/keyword，或在 shops 里给每店 ids/keyword");
if (!CFG.recordRoot && !CFG.root) addIssue("root_missing", "请配置 recordRoot（记录输出目录）");
if (!DRYRUN && CFG.confirmDestructive !== true) addIssue("destructive_not_confirmed", "真实下架必须显式 confirmDestructive:true；先用 dryRun 确认清单");
if (!DRYRUN && !String(CFG.reason || "暂停销售").trim()) addIssue("reason_empty", "申请下架需要非空 reason");
if (!DRYRUN && anyKeyword && CFG.allowKeywordLive !== true) addIssue("keyword_live_not_allowed", "关键词模式真实下架可能一次下很多商品；如确认要批量下架，显式 allowKeywordLive:true");
if (!DRYRUN && !anyKeyword) {
  for (const s of useShops) {
    for (const id of (s._hasIds ? s._ids : ids)) {
      const chk = await assertCan({ root: LEDGER_ROOT, shop: s.shop, goodsId: id, action: "delist", targetId: id, allowUnknown: true });
      if (!chk.allowed) addIssue(chk.blocked, `商品 ${id} 当前状态 ${chk.state.lifecycleStatus}，不能下架`);
    }
  }
}
if (!existsSync(EGO)) addIssue("ego_not_found", "ego-browser 不可用：" + EGO, { ego: EGO });

if (issues.length) {
  console.log("PREFLIGHT=needs_user_input");
  console.log(JSON.stringify({ status: "needs_user_input", dryRun: DRYRUN, recordRoot: RECORD_ROOT, issues }, null, 1));
  process.exit(3);
}
await fs.mkdir(RESULT_DIR, { recursive: true });
await fs.mkdir(LOG_DIR, { recursive: true });
await fs.mkdir(RUNTIME + "/" + RUN_ID, { recursive: true });

async function runOne(store, i) {
  const job = {
    shop: store.shop,
    profile: store.profile || null,
    ids: store._hasIds ? store._ids : ids,
    keyword: store._hasKeyword ? store._keyword : keyword,
    reason: String(CFG.reason || "暂停销售"),
    dryRun: DRYRUN,
    enumerateOnly: !!CFG.enumerateOnly,
    recordRoot: RECORD_ROOT,
    resultPath: path.join(RESULT_DIR, store.shop + ".json"),
    logPath: path.join(LOG_DIR, store.shop + ".log"),
    keepOpen: !!CFG.keepOpen,
  };
  const wrapper = RUNTIME + "/" + RUN_ID + "/job-" + i + ".mjs";
  await fs.writeFile(wrapper, "globalThis.__JOB = " + JSON.stringify(job) + ";\nawait import('file:///" + WORKER + "');\n", "utf8");
  const started = Date.now();
  const child = spawn(EGO, ["nodejs", "-e", "await import('file:///" + wrapper + "')"], { stdio: "ignore", windowsHide: true });
  const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, Number(CFG.jobTimeoutSec || 600) * 1000);
  await new Promise((res) => child.on("exit", res));
  clearTimeout(timer);
  let result = null;
  for (let k = 0; k < 12 && !result; k++) { try { result = JSON.parse(await fs.readFile(job.resultPath, "utf8")); } catch (e) { await sleep(300); } }
  if (!result) result = { ok: false, status: "failed", error: "no_result_file" };
  return { shop: store.shop, result, wallSec: Number(((Date.now() - started) / 1000).toFixed(1)) };
}

const completed = [];
for (let i = 0; i < useShops.length; i++) {
  const r = await runOne(useShops[i], i);
  completed.push(r);
  if (!DRYRUN && r.result && r.result.status === "done") {
    const list = (r.result.records || r.result.items || []).map((x) => String(x.goodsId || x.id || "")).filter(Boolean);
    const targetIds = list.length ? list : (useShops[i]._hasIds ? useShops[i]._ids : ids);
    for (const id of targetIds) {
      try { await recordResult({ root: LEDGER_ROOT, skill: "pdd-delist", shop: r.shop, action: "delist", goodsId: id, targetId: id, target: "商品下架", before: "在售", after: { lifecycleStatus: "已下架" }, result: "success", runId: RUN_ID, evidence: path.join(RESULT_DIR, r.shop + ".json") }); } catch (e) { console.error("RECORD_FAILED " + (e && e.message || e)); }
    }
  }
  const x = r.result || {};
  console.log("DONE " + r.shop + " status=" + (x.needs ? "needs" : (x.status || "?")) + " requested=" + (x.requested === undefined ? "-" : x.requested) + " wall=" + r.wallSec + "s" + (x.error ? " err=" + x.error : ""));
}
const report = {
  runId: RUN_ID, dryRun: DRYRUN, recordRoot: RECORD_ROOT, ids, keyword,
  createdAt: new Date().toISOString(),
  stores: completed.map((c) => ({
    shop: c.shop, status: c.result.needs ? "needs" : (c.result.status || "failed"), ok: !!c.result.ok,
    requested: c.result.requested, record: c.result.record,
    records: c.result.records, zeroCheck: c.result.zeroCheck,
    needs: c.result.needs, error: c.result.error, wallSec: c.wallSec,
  })),
};
await fs.writeFile(path.join(RUN_DIR, "report.json"), JSON.stringify(report, null, 1), "utf8");
const lines = ["delist " + RUN_ID + " dryRun=" + DRYRUN + " ids=" + ids.length + " keyword=" + JSON.stringify(keyword)];
for (const s of report.stores) lines.push([s.shop.padEnd(10), s.status.padEnd(9), "requested=" + (s.requested === undefined ? "-" : s.requested), "wall=" + s.wallSec + "s", s.error || ""].join(" "));
await fs.writeFile(path.join(RUN_DIR, "summary.txt"), lines.join("\n"), "utf8");
console.log("\n" + lines.join("\n"));
console.log("REPORT=" + path.join(RUN_DIR, "report.json"));
console.log(DRYRUN ? "DRY_RUN=1 (未真实下架)" : "LIVE=1 (真实下架已执行)");
if (report.stores.some((s) => s.needs)) process.exit(4);
if (report.stores.some((s) => s.status === "failed")) process.exit(5);
