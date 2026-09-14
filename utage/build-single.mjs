#!/usr/bin/env node
/**
 * UTAGEに貼り付けるための単一HTMLを dist/utage.html として出力する。
 *
 *   node utage/build-single.mjs
 *
 * ・CSS / JS は原本の時点でインライン。外部ファイルの読み込みは無い
 * ・画像は images.map.json のUTAGE絶対URLに差し替える（相対パスを残さない）
 * ・<html><head><body> は原本の構造をそのまま保つ
 * ・サイズが4MBを超えたらエラーで止める
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/config.json'), 'utf8'));
const imageMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/images.map.json'), 'utf8'));

let html = fs.readFileSync(path.join(ROOT, cfg.source), 'utf8');

// ---- 画像を絶対URLへ ----
const pairs = Object.entries(imageMap)
  .filter(([k]) => !k.startsWith('_'))
  .map(([k, v]) => [k, typeof v === 'string' ? v : v.url])
  .sort((a, b) => b[0].length - a[0].length);
let n = 0;
for (const [rel, url] of pairs) {
  const hit = html.split(rel).length - 1;
  if (hit > 0) { html = html.split(rel).join(url); n += hit; }
}

// ---- 検証 ----
const problems = [];
const rel = [...html.matchAll(/(?:src|href)="(?!https?:|#|mailto:|tel:|data:)([^"]+)"/g)].map(m => m[1]);
if (rel.length) problems.push(`相対パスが残っています: ${[...new Set(rel)].join(', ')}`);
for (const tag of ['<html', '<head', '<body']) {
  if (!html.includes(tag)) problems.push(`${tag}> タグがありません`);
}
for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
  const tag = m[0];
  if (!/rel=["']?stylesheet/i.test(tag)) continue;
  if (!/fonts\.googleapis\.com/.test(tag)) problems.push(`Googleフォント以外の外部CSSが残っています: ${tag}`);
}
for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  if (!/googletagmanager\.com/.test(m[1])) problems.push(`GTM以外の外部JSが残っています: ${m[1]}`);
}
const bytes = Buffer.byteLength(html, 'utf8');
if (bytes > 4 * 1024 * 1024) problems.push(`4MBを超えています（${(bytes / 1048576).toFixed(2)}MB）`);

if (problems.length) { problems.forEach(p => console.error('NG  ' + p)); process.exit(1); }

const out = path.join(ROOT, 'dist/utage.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

console.log(`原本          : ${cfg.source}`);
console.log(`画像の絶対URL化: ${n}箇所`);
console.log(`<html>/<head>/<body>: あり`);
console.log(`相対パスの残り  : 0`);
console.log(`サイズ         : ${(bytes / 1024).toFixed(1)}KB（上限 4MB）`);
console.log(`\n生成先: dist/utage.html`);
