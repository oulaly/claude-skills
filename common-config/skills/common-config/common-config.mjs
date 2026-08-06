#!/usr/bin/env node
// common-config.mjs —— 把通用偏好片段合并进全局 ~/.claude/settings.json（无 LLM 也可独立运行）
//
// 用法：
//   node common-config.mjs show   查看片段内容（已按当前平台过滤）
//   node common-config.mjs diff   对比全局 settings 与片段的差异，不写文件
//   node common-config.mjs apply  合并写入（自动 .bak 备份，只动片段内的键）
//
// 数据流：snippet.json（与本脚本同目录） → ~/.claude/settings.json
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNIPPET = path.join(HERE, "snippet.json");
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
// 仅 Windows 平台生效的 env 键，其他平台 apply/diff/show 时自动剔除
const WINDOWS_ONLY_ENV = new Set(["CLAUDE_CODE_USE_POWERSHELL_TOOL"]);

function readJson(file, fallback = {}) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`JSON 解析失败: ${file}（${e.message}），已中止，未做任何修改`); }
}
function writeJson(file, obj) {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function loadSnippet() {
    const s = readJson(SNIPPET);
    if (process.platform !== "win32" && s.env) {
        for (const k of Object.keys(s.env)) if (WINDOWS_ONLY_ENV.has(k)) delete s.env[k];
    }
    return s;
}

// 展开为 [{key, value}] 扁平列表；env 逐键比较，其余顶层键整体比较
// "_" 开头的键（如 _comment）视为注释，不参与比较与写入
function flatten(snippet) {
    const items = [];
    for (const [k, v] of Object.entries(snippet)) {
        if (k.startsWith("_")) continue;
        if (k === "env" && v && typeof v === "object") {
            for (const [ek, ev] of Object.entries(v)) {
                if (!ek.startsWith("_")) items.push({ key: `env.${ek}`, value: ev });
            }
        } else {
            items.push({ key: k, value: v });
        }
    }
    return items;
}
function getAt(settings, key) {
    if (key.startsWith("env.")) return (settings.env || {})[key.slice(4)];
    return settings[key];
}
function setAt(settings, key, value) {
    if (key.startsWith("env.")) {
        settings.env = settings.env || {};
        settings.env[key.slice(4)] = value;
    } else {
        settings[key] = value;
    }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = v => (v === undefined ? "(未设置)" : JSON.stringify(v));

function diff() {
    const snippet = loadSnippet();
    const settings = readJson(SETTINGS);
    const items = flatten(snippet);
    const toSet = items.filter(i => !eq(getAt(settings, i.key), i.value));
    if (!toSet.length) {
        console.log(`✅ ${SETTINGS} 已与片段一致，无需修改。`);
        return [];
    }
    console.log(`与 ${SETTINGS} 的差异（${toSet.length} 项）:`);
    for (const i of toSet) console.log(`  ${i.key}: ${fmt(getAt(settings, i.key))} -> ${fmt(i.value)}`);
    console.log("（apply 只写入以上键，其余现有配置不受影响，写入前自动备份 .bak）");
    return toSet;
}

const [cmd] = process.argv.slice(2);
try {
    if (cmd === "show") {
        console.log(JSON.stringify(loadSnippet(), null, 2));
        if (process.platform !== "win32") console.log(`（已剔除 Windows 专属键: ${[...WINDOWS_ONLY_ENV].join(", ")}）`);
    } else if (cmd === "diff") {
        diff();
    } else if (cmd === "apply") {
        const toSet = diff(); // 无差异时 diff 已输出"一致"，此处 toSet 为空
        if (toSet.length) {
            const settings = readJson(SETTINGS);
            for (const i of toSet) setAt(settings, i.key, i.value);
            fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
            writeJson(SETTINGS, settings);
            console.log(`✅ 已写入 ${SETTINGS}（${toSet.length} 项，原文件备份为 settings.json.bak），新开会话后生效。`);
        }
    } else {
        console.log("用法: node common-config.mjs [show | diff | apply]");
    }
} catch (e) {
    console.error("❌ " + e.message);
    process.exit(1);
}
