#!/usr/bin/env node
/**
 * women-v2/index.html（原本）から、UTAGEに載せるA版・B版のHTMLを生成する。
 *
 *   node utage/build.mjs
 *
 * 生成物は utage/dist/a.html, utage/dist/b.html。
 * 原本は GitHub Pages でそのまま見られる状態を保ち、
 *「UTAGE用に何を変えているか」はこのスクリプトと config.json だけに集約する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/config.json'), 'utf8'));
const imageMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/images.map.json'), 'utf8'));

const escAttr = (s) => s.replace(/&/g, '&amp;');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- 1. 原本を読む ----------
const srcPath = path.join(ROOT, cfg.source);
if (!fs.existsSync(srcPath)) {
  console.error(`原本が見つかりません: ${cfg.source}`);
  process.exit(1);
}
let base = fs.readFileSync(srcPath, 'utf8');

// ---------- 2. 画像をUTAGEのURLに差し替える ----------
const pairs = Object.entries(imageMap)
  .filter(([k]) => !k.startsWith('_'))
  .map(([k, v]) => [k, typeof v === 'string' ? v : v.url])
  .sort((a, b) => b[0].length - a[0].length); // 長い名前から（部分一致の取り違え防止）

let replacedImages = 0;
for (const [rel, url] of pairs) {
  const n = base.split(rel).length - 1;
  if (n > 0) { base = base.split(rel).join(url); replacedImages += n; }
}

// 取りこぼしがあれば止める（画像切れのまま公開されるのを防ぐ）
const leftover = [...new Set(base.match(/images\/[^\s"'()]+/g) || [])];
if (leftover.length) {
  console.error('UTAGEのURLに変換できていない画像があります:');
  leftover.forEach((f) => console.error(`  - ${f}`));
  console.error('\nUTAGE_API_KEY=xxxx node utage/sync-images.mjs を実行してください（自動でアップロードします）。');
  process.exit(1);
}

// ---------- 3. バージョンごとに生成 ----------
const distDir = path.join(ROOT, cfg.dist_dir);
fs.mkdirSync(distDir, { recursive: true });

const PASSTHROUGH = `
<script>
/* 広告からLPに付いてきたパラメータを、申込フォームのリンクに引き継ぐ */
(function(){
  try {
    var incoming = new URLSearchParams(location.search);
    if (!incoming.toString()) return;
    Array.prototype.forEach.call(document.querySelectorAll('a.js-apply'), function(a){
      var u = new URL(a.href);
      incoming.forEach(function(v, k){ u.searchParams.set(k, v); });
      a.href = u.toString();
    });
  } catch (e) {}
})();
</script>
`;

const summary = [];

for (const v of cfg.variants) {
  let html = base;
  const ctaAttr = escAttr(v.cta);

  // CTAの遷移先
  const ctaCount = html.split(cfg.origin_cta).length - 1;
  if (ctaCount === 0) {
    console.error(`[${v.key}] 原本に CTA (${cfg.origin_cta}) が見つかりません。config.json の origin_cta を確認してください。`);
    process.exit(1);
  }
  html = html.split(cfg.origin_cta).join(ctaAttr);

  // 別タブ遷移をやめる（計測を確実にするため）
  html = html.split(' target="_blank" rel="noopener"').join('');

  // バージョン固有の文言差し替え
  for (const [from, to] of v.replacements) html = html.split(from).join(to);

  // 申込フォーム版：CTAに js-apply を付けて引き継ぎスクリプトを入れる
  if (v.apply_passthrough) {
    html = html.replace(new RegExp(`(<a class="[^"]*)(" href="${escRe(ctaAttr)}")`, 'g'), '$1 js-apply$2');
    html = html.replace('</body>', `${PASSTHROUGH}</body>`);
  }

  const outPath = path.join(distDir, `${v.key}.html`);
  fs.writeFileSync(outPath, html);

  const bytes = Buffer.byteLength(html);
  summary.push({ key: v.key, label: v.label, cta: ctaCount, bytes });

  if (bytes > 4 * 1024 * 1024) {
    console.error(`[${v.key}] 4MBを超えています。UTAGEに入りません。`);
    process.exit(1);
  }
}

console.log(`原本            : ${cfg.source}`);
console.log(`画像の差し替え  : ${replacedImages}箇所`);
for (const s of summary) {
  console.log(`  ${s.key} (${s.label})  CTA ${s.cta}箇所 / ${(s.bytes / 1024).toFixed(0)}KB`);
}
console.log(`\n生成先: ${cfg.dist_dir}/`);
