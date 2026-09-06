#!/usr/bin/env node
/**
 * utage/dist/ のHTMLを、UTAGEの該当ページに反映する。
 *
 *   UTAGE_API_KEY=xxxx node utage/deploy.mjs          # A・B両方
 *   UTAGE_API_KEY=xxxx node utage/deploy.mjs a        # A だけ
 *   UTAGE_API_KEY=xxxx node utage/deploy.mjs --dry-run # 送信せず内容だけ確認
 *
 * APIキーは UTAGE管理画面 → 右メニューの「API設定」から発行する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'utage/config.json'), 'utf8'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

const apiKey = process.env.UTAGE_API_KEY;
if (!apiKey && !dryRun) {
  console.error('環境変数 UTAGE_API_KEY が設定されていません。');
  console.error('UTAGE管理画面の「API設定」でキーを発行し、GitHubのSecretsに UTAGE_API_KEY として登録してください。');
  process.exit(1);
}

const targets = cfg.variants.filter((v) => only.length === 0 || only.includes(v.key));
if (!targets.length) {
  console.error(`該当するバージョンがありません: ${only.join(', ')}`);
  process.exit(1);
}

let failed = 0;

for (const v of targets) {
  const file = path.join(ROOT, cfg.dist_dir, `${v.key}.html`);
  if (!fs.existsSync(file)) {
    console.error(`[${v.key}] ${cfg.dist_dir}/${v.key}.html がありません。先に node utage/build.mjs を実行してください。`);
    failed++;
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const url = `${cfg.api_base}/funnels/${cfg.funnel_id}/steps/${v.step_id}/pages/${v.page_id}`;

  if (dryRun) {
    console.log(`[${v.key}] (dry-run) PATCH ${url}  ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`);
    continue;
  }

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: v.title,
        is_no_index: v.is_no_index,
        html_source: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[${v.key}] 失敗 HTTP ${res.status}\n${body.slice(0, 600)}`);
      failed++;
      continue;
    }
    console.log(`[${v.key}] 反映しました  ${v.label}  →  ${v.step_url}`);
  } catch (e) {
    console.error(`[${v.key}] 通信エラー: ${e.message}`);
    failed++;
  }
}

process.exit(failed ? 1 : 0);
