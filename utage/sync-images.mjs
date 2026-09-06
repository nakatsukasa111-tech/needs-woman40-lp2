#!/usr/bin/env node
/**
 * 原本で使われている画像を、UTAGEのメディアへ自動でアップロードする。
 *
 *   UTAGE_API_KEY=xxxx node utage/sync-images.mjs
 *
 * ・ファイルの中身から算出したハッシュを名前に使う（w40-<hash>.jpg）ので、
 *   同じ画像を二重にアップロードしない。中身を差し替えれば自動で上げ直す。
 * ・結果は utage/images.map.json に控える。この控えが無くても、
 *   UTAGE側を名前で検索して見つけるので、二重アップロードにはならない。
 * ・変更が無ければ通信は一切しない（APIキーも不要）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/config.json'), 'utf8'));
const MAP_PATH = path.join(ROOT, 'utage/images.map.json');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

const apiKey = process.env.UTAGE_API_KEY;
const api = async (method, endpoint, body) => {
  if (!apiKey) {
    throw new Error('UTAGE_API_KEY が未設定です。新しい画像をアップロードするにはAPIキーが必要です。');
  }
  const res = await fetch(`${cfg.api_base}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} → HTTP ${res.status}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
};

// ---------- 原本で実際に使われている画像を洗い出す ----------
const html = fs.readFileSync(path.join(ROOT, cfg.source), 'utf8');
const referenced = [...new Set(html.match(/images\/[^\s"'()]+/g) || [])].sort();
if (!referenced.length) {
  console.log('原本に images/ の参照がありません。何もしません。');
  process.exit(0);
}

// ---------- 控えを読む ----------
let map = {};
if (fs.existsSync(MAP_PATH)) {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    map[k] = typeof v === 'string' ? { url: v } : v;   // 旧形式（URLだけ）も読める
  }
}

const rows = [];
let uploaded = 0, reused = 0, cached = 0;

try {
for (const rel of referenced) {
  const file = path.join(ROOT, path.dirname(cfg.source), rel);
  if (!fs.existsSync(file)) {
    console.error(`原本が参照している画像が見つかりません: ${rel}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const ext = path.extname(rel).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    console.error(`対応していない拡張子です: ${rel}`);
    process.exit(1);
  }
  const remoteName = `w40-${hash}${ext}`;

  // 1. 控えが一致していればそのまま
  if (map[rel]?.hash === hash && map[rel]?.url) {
    cached++;
    rows.push([rel, '控えを使用', map[rel].url]);
    continue;
  }

  // 2. UTAGE側を名前で検索（控えが無くても二重アップロードしない）
  const found = await api('GET', `/media?keyword=${encodeURIComponent(remoteName)}&per_page=100`);
  const hit = (found.data || []).find((m) => m.name === remoteName);
  if (hit) {
    map[rel] = { hash, url: hit.url, media_id: hit.id, remote_name: remoteName };
    reused++;
    rows.push([rel, 'UTAGE側に既存', hit.url]);
    continue;
  }

  // 3. 無ければアップロード
  let issued;
  try {
    issued = await api('POST', '/media/upload-url', { filename: remoteName, filetype: mime });
  } catch (e) {
    // フィールド名の違いに備えた再試行
    issued = await api('POST', '/media/upload-url', { filename: remoteName, mime_type: mime });
  }
  const { media_id, presigned_post } = issued.data;

  const form = new FormData();
  for (const [k, v] of Object.entries(presigned_post.fields)) form.append(k, v);
  form.append('file', new Blob([buf], { type: mime }), remoteName);

  const up = await fetch(presigned_post.url, { method: 'POST', body: form });
  if (!up.ok) {
    console.error(`アップロード失敗 ${rel} → HTTP ${up.status}\n${(await up.text()).slice(0, 500)}`);
    process.exit(1);
  }

  const done = await api('POST', '/media/complete', { media_id });
  const url = done.data.url;
  map[rel] = { hash, url, media_id, remote_name: remoteName };
  uploaded++;
  rows.push([rel, 'アップロード', url]);
}
} catch (e) {
  console.error(`\n画像の同期に失敗しました。\n${e.message}\n`);
  process.exit(1);
}

// ---------- 控えを書き戻す ----------
const out = {
  _comment: '原本の images/ → UTAGEメディアの公開URL。utage/sync-images.mjs が自動で更新します。手で書き換える必要はありません。',
};
for (const k of Object.keys(map).sort()) out[k] = map[k];
fs.writeFileSync(MAP_PATH, JSON.stringify(out, null, 2) + '\n');

const w = Math.max(...rows.map((r) => [...r[0]].length));
for (const [rel, state] of rows) console.log(`  ${rel.padEnd(w)}  ${state}`);
console.log(`\n画像 ${referenced.length}枚 — 新規 ${uploaded} / UTAGE側で発見 ${reused} / 変更なし ${cached}`);
