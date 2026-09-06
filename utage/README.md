# UTAGE への自動反映

`women-v2/index.html` を直して main に push すると、UTAGEのLPが自動で更新されます。
画像も自動でUTAGEへアップロードされるので、手作業は要りません。

## 全体像

```
women-v2/index.html ＋ women-v2/images/     ← ここだけを直す（原本）
        │
        │ ① sync-images.mjs  新しい画像をUTAGEメディアへ自動アップロード
        │ ② build.mjs        画像URL・CTA・文言を差し替えてA版/B版を生成
        │ ③ deploy.mjs       UTAGE API へ PATCH
        ▼
A：LINE登録版                      B：自社申込フォーム版
utage-system.com/p/AKSSGDZ7B3qq   utage-system.com/p/VMmOUcGnkP8m
```

原本は GitHub Pages でそのまま見られる状態を保っています。
「UTAGE用に何を変えているか」は `utage/config.json` にだけ書いてあります。

## 2つのバージョンの違い

| | A：LINE登録版 | B：自社申込フォーム版 |
|---|---|---|
| CTAの遷移先 | UTAGE経由のLINE登録 | nds-training.jp の申込フォーム |
| LINEバッジ | あり | なし |
| ボタン文言 | 無料体験を予約する | 無料体験を申し込む |
| 所要時間の表記 | 30秒 | 1分ほど |
| 広告パラメータ | UTAGEが記録 | フォームのリンクに引き継ぐ |

違いはすべて `utage/config.json` の `variants` に書いてあります。
文言や遷移先を変えたいときは、スクリプトではなく config.json を直してください。

## 最初の設定（1回だけ）

1. UTAGE管理画面 → 右メニューの **API設定** でAPIキーを発行する
2. GitHub のリポジトリ → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `UTAGE_API_KEY`
   - Secret: 発行したキー
3. Actions タブから「UTAGEへ反映」を手動実行して、動くことを確認する

## 普段の使い方

原本を直して push するだけです。画像を足しても差し替えても、そのままで構いません。

```bash
git add -A && git commit -m "LPの文言を修正" && git push
```

手元で確認したいとき:

```bash
npm run build          # 生成だけ（通信なし）
npm run deploy:dry     # 送信内容の確認だけ
UTAGE_API_KEY=xxxx npm run deploy   # 手元から反映
```

## 画像の扱い

`women-v2/images/` に置いて原本から参照するだけです。あとは自動です。

- 中身から算出したハッシュを名前にして上げるので、**同じ画像を二重にアップロードしません**
- 画像を差し替えると、中身が変わるので**自動で上げ直します**
- 結果は `utage/images.map.json` に控えられ、ワークフローがコミットし直します
- 控えが消えても、UTAGE側を名前で検索して見つけるので二重にはなりません

## バージョンを増やしたいとき

`utage/config.json` の `variants` に追記します。先にUTAGE側でステップとページを作り、
そのIDを `step_id` / `page_id` に入れてください。

## 注意

- UTAGEのページはHTMLを丸ごと入れ替える方式です。UTAGEの管理画面で直接編集しても、
  次のpushで上書きされます。**編集は必ずリポジトリ側で**行ってください。
- 1ページ4MBが上限です。超えるとビルドが止まります。
