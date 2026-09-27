# 速読文庫

青空文庫の作品を、単語または短いまとまり単位で画面中央に表示する速読用の静的Webアプリです。

## 機能

- 日本語をブラウザ標準の \`Intl.Segmenter\` で単語分割
- 100〜1200語/分の速度調整
- 1〜5語をまとめて表示
- 句読点・改行で自動的に少し長く停止
- 再生 / 停止、前後移動、読書位置シーク
- 作品ごとの読書位置をブラウザに保存
- キーボード操作
- ダークモード
- 全画面表示
- スマートフォン対応

## 収録作品

初期状態では、次の作品を選べます。

- 太宰治「走れメロス」
- 太宰治「人間失格」
- 太宰治「斜陽」
- 夏目漱石「こころ」
- 夏目漱石「坊っちゃん」
- 夏目漱石「吾輩は猫である」
- 宮沢賢治「セロ弾きのゴーシュ」

作品一覧は \`app.js\` の \`BOOKS\` に追加できます。

## 本文データ

本文は青空文庫の作品を UTF-8 に変換・再配置している非公式ミラー
[P4suta/aozorabunko_text](https://github.com/P4suta/aozorabunko_text)
からブラウザで都度取得します。

元データ:
- [青空文庫](https://www.aozora.gr.jp/)
- [青空文庫収録ファイルの取り扱い規準](https://www.aozora.gr.jp/guide/kijyunn.html)

作品カタログの権利判定には青空文庫公式書誌の著作権フラグを使用します。
本文取得元の非公式ミラー自体には著作権存続作品も含まれるため、
ミラーの全件をそのまま公開対象にはしません。

各作品には可能な限り青空文庫の図書カード URL も保持し、
読書画面から公式の図書カードを開けるようにしています。

## ローカル実行

ビルドは不要です。単純なHTTPサーバーで配信してください。

\`\`\`bash
python -m http.server 8000
\`\`\`

その後、ブラウザで \`http://localhost:8000\` を開きます。

\`file://\` で直接開くと、ブラウザの制限で外部本文を取得できない場合があります。


## FTPでそのまま公開する

このリポジトリは静的サイトなので、一般的なレンタルサーバーへそのままFTPアップロードして使えます。

必要なサーバー機能:
- HTML/CSS/JavaScriptを配信できること
- HTTPS推奨
- PHP / Node.js / Python / DB / cron は不要

公開方法:
1. このリポジトリをZIPでダウンロードして展開
2. ルート直下の `index.html`、`styles.css`、`app.js` などを公開ディレクトリへFTPアップロード
3. ブラウザでそのURLを開く

`books.json` がFTP先に存在する場合はローカル版を優先します。
存在しない場合は、GitHub Pages上の著作権確認済みカタログ
`https://nano-tani.github.io/sokudoku/books.json`
を自動取得します。

そのため、GitHub Actionsや `scripts/build_catalog.py` をFTP先で実行する必要はありません。
ローカル・リモートのカタログが両方利用できない場合だけ、コード内の安全な7作品へ縮退します。


### matome.but.jp 配下に置く場合

例として `https://matome.but.jp/sokudoku/` で公開する場合は、
`/sokudoku/` ディレクトリ直下へサイト一式をアップロードしてください。

```text
/sokudoku/
├─ index.html
├─ styles.css
├─ app.js
├─ favicon.svg
├─ site.webmanifest
├─ sitemap.xml
├─ .htaccess
└─ books.json  # 任意
```

`.htaccess` はこのサブディレクトリにだけ置く前提です。
`matome.but.jp` 直下へ置くと、同ドメインの他コンテンツにも設定が影響するため避けてください。

FTPソフトによってはドットで始まる `.htaccess` が非表示になることがあります。
アップロード後、サーバー側に `.htaccess` が存在することを確認してください。

### 自前サーバーへ完全にコピーしたい場合

外部のカタログ取得にも依存したくない場合は、GitHub Pagesで生成済みの `books.json` も
`index.html` と同じディレクトリへ置いてください。アプリは自動的にローカル版を優先します。

## GitHub Pages

\`.github/workflows/pages.yml\` を同梱しています。

GitHub Pages が未設定の場合は、一度だけリポジトリの
**Settings → Pages → Build and deployment → Source → GitHub Actions**
を選んでください。

その後は \`main\` への push で自動デプロイされます。

## 操作

- Space: 再生 / 停止
- ← / →: 前 / 次
- ↑ / ↓: 速度を25語/分ずつ変更

## 実装方針

依存パッケージやビルド処理を持たない静的構成です。
日本語の分割は対応ブラウザでは \`Intl.Segmenter("ja", { granularity: "word" })\` を使い、
未対応環境では簡易分割へフォールバックします。


## 著作権フィルター

`scripts/build_catalog.py` は次の順でカタログを生成します。

1. `P4suta/aozorabunko_text` のファイル一覧を取得
2. 青空文庫公式の拡充版 UTF-8 CSV を取得
3. 作品単位で作品・人物の著作権フラグを確認
4. 権利切れを確認でき、かつミラー上のパスと安全に対応付けられた作品だけ採用
5. `rightsPolicy: "public-domain-only"` を付けて `books.json` を生成

ブラウザ側も `rightsPolicy` と各作品の `rights` を検証し、
未検証の古いカタログや不正なカタログは読み込みません。


## SEO・公開URL

本番URLは次で固定しています。

`https://matome.but.jp/sokudoku/`

`index.html` には以下を設定済みです。

- canonical URL
- description / robots
- OGP / X(Twitter) metadata
- 日本語 hreflang
- WebApplication の構造化マークアップ
- favicon / Web App Manifest
- sitemap 参照

`sitemap.xml` は
`https://matome.but.jp/sokudoku/sitemap.xml`
として公開します。

### robots.txt について

robots.txt はサブディレクトリではなく、必ずドメイン直下
`https://matome.but.jp/robots.txt`
に置く必要があります。そのため、このリポジトリから
`/sokudoku/robots.txt` を配布しても検索エンジンには有効ではありません。

matome.but.jp 全体の既存 robots.txt を確認したうえで追記できる場合は、次の1行だけ追加してください。

```text
Sitemap: https://matome.but.jp/sokudoku/sitemap.xml
```

既存の他コンテンツ用ルールは削除しないでください。
