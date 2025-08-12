# LoL 最適ピック提案 Pro++ — デスクトップアプリ (v2)

**Electron + Vite + React**。LCU(League Client)からピックを読み取り、UIへ自動反映します。

## 使い方（開発）
1. Node.js 18+ を入れる
2. このフォルダで: `npm i`
3. 起動: `npm run dev`

## ビルド後に表示
```
npm run build:web
npm run app:prod
```

## LCU 連動
- 内蔵HTTPサーバ(ポート 5123)の `/lobby/champ-select` を1.5秒毎に参照
- lockfile を自動探索。見つからない場合は環境変数で指定可:
  - Windows: `set LOL_LOCKFILE=C:\Riot Games\League of Legends\lockfile`
  - macOS: `export LOL_LOCKFILE="/Applications/League of Legends.app/Contents/LoL/lockfile"`

## うまく行かないとき
- 画像/一覧が出ない → ネット接続を確認（Data Dragon使用）
- 連動しない → LoLがチャンピオンセレクト画面か確認。FW/セキュリティで 127.0.0.1 を許可。

## 変更点
- CORS 有効化（レンダラー→ローカルサーバ）
- 204(データなし)のときにフロントでJSONを読まない安全処理
