<div align="center">

<img src="docs/images/landing.webp" alt="Eidolon-SC：283プロのアイドルとおしゃべりしよう" width="100%">

**『アイドルマスター シャイニーカラーズ』のアイドルとリアルタイムで話せる AI 分身**

音声 · テキスト · コミュの記憶 · キャラクター間で共有されるメモリー

[简体中文](README.md) · [English](README.en.md) · **日本語**

[![CI](https://img.shields.io/github/actions/workflow/status/Sallyn0225/eidolon-sc/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/Sallyn0225/eidolon-sc/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](backend/pyproject.toml)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Pipecat](https://img.shields.io/badge/Pipecat-WebRTC-6E56CF?style=flat-square)](https://github.com/pipecat-ai/pipecat)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](frontend/package.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](frontend/package.json)
[![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](docker-compose.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-A42E2B?style=flat-square&logo=gnu&logoColor=white)](LICENSE)

[プレビュー](#-プレビュー) · [特長](#-特長) · [クイックスタート](#-クイックスタート) · [設定ガイド](docs/configuration.ja.md) · [デプロイ](docs/deploy.md) · [設計判断](docs/adr/)

</div>

---

Eidolon-SC では、**283プロのプロデューサー**として原作のアイドルとチャットしたり、そのまま電話したりできます。アイドルは日本語の声で答え、中国語字幕が付きます。原作で自分が経験したコミュを思い出せるうえ、あなたが話したことも覚えていて、アイドルたちのあいだで「伝わって」いきます。

原作の 8 ユニット・**28 人のアイドル**がすべて設定済みで、すぐに話せます。公開サーバーにデプロイすれば、誰でも Google または GitHub でログインして使えます。

> [!IMPORTANT]
> 本プロジェクトは非公式のファンメイド作品であり、バンダイナムコおよび『アイドルマスター』シリーズの権利者とは一切関係ありません。アイドルは AI が演じています。シナリオデータは**リポジトリに含まれていない**ため、各自で用意してください（[ADR-0003](docs/adr/0003-corpus-and-voices-stay-private.md)）。アイドルの返事を通じてコミュの内容が間接的にログインユーザーへ提供されるリスクについては [ADR-0006](docs/adr/0006-open-to-the-public-with-oauth.md) を参照してください。

## 📸 プレビュー

<p align="center">
  <img src="docs/images/call-demo.webp" alt="真乃との通話：中国語を聞き取り、日本語の声で答え、立ち絵は感情に合わせて表情を変える" width="100%">
  <br>
  <sub>真乃に電話：あなたは中国語で話し、真乃は日本語の声で答えます。字幕は同時に表示され、立ち絵はひとまとまりごとの感情で表情を変えます</sub>
</p>

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/app-dark.webp">
        <img src="docs/images/app-light.webp" alt="会話画面：灯織に話した猫のことを恋鐘が思い出す">
      </picture>
      <p align="center"><sub><b>キャラクター間で共有されるメモリー</b>：猫を飼っていると話したのは灯織だけなのに、恋鐘が「灯織から聞いたばい」</sub></p>
    </td>
    <td width="50%">
      <img src="docs/images/outfits.webp" alt="着替えパネル">
      <p align="center"><sub><b>着替え</b>：原作のどのカードの衣装も着られ、私服とステージ衣装を切り替えられます</sub></p>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><img src="docs/images/phone-list.webp" alt="スマートフォンの会話一覧"></td>
    <td width="33%"><img src="docs/images/phone-chat.webp" alt="スマートフォンでの会話"></td>
    <td width="33%"><img src="docs/images/phone-call.webp" alt="スマートフォンの通話画面"></td>
  </tr>
  <tr>
    <td align="center"><sub>会話一覧：最近やり取りした順に並び、中国語訳名・かな・ローマ字・ユニット名で検索できます</sub></td>
    <td align="center"><sub>日本語のセリフにはすべて中国語字幕が付きます</sub></td>
    <td align="center"><sub>スマートフォンでは通話画面が全画面になります</sub></td>
  </tr>
</table>

<details>
<summary><b>ランディングページ</b>：一筋の白い光が 28 色のイメージカラーに分かれ、その一本一本がひとりのアイドル</summary>

<br>

<img src="docs/images/landing-tour.webp" alt="ランディングページのスクロール演出" width="100%">

</details>

## ✨ 特長

**彼女と話す**

- 🎙️ **リアルタイム音声通話**：WebRTC による全二重通話で、中国語でも日本語でも話せます。いつでも割り込んで話をさえぎれ、通話画面を閉じて会話記録に戻ることもできます。
- 🇯🇵 **日本語の声 + 中国語字幕**：アイドルは常に日本語で答え、語尾や口癖をそのまま残しつつ、一文ごとに中国語字幕を付けます（[ADR-0001](docs/adr/0001-japanese-replies-with-chinese-subtitles.md)）。セリフは演技指示つきで音声合成に回すので抑揚のある読み上げになり、固有名詞は読み表どおりに正しく読みます。
- 🎭 **動く立ち絵**：通話画面に原作の Spine 立ち絵を重ねます。呼吸し、まばたきし、口を動かし、感情に合わせて表情を変え、うなずいたり首を振ったりします。原作に新しいカードが出ても、週 1 回の同期で着られるようになります。
- 💗 **好感度とプレゼント**：あなたの言葉しだいで彼女は心を開いたり距離を置いたりします。傷つけすぎるとしばらく口をきいてくれず、通話中なら電話を切られます。判断するのはデプロイした人の判断モデルなので、自前の LLM でも変えられません。毎日の抽選でプレゼントを手に入れて彼女に贈れます。好きなものほど心に響き、次の返事で応えてくれます。

  <img src="docs/images/gifts.webp" alt="プレゼント画面：抽選台、リセットカード、バックパックのプレゼント" width="100%">

**彼女が覚えていること**

- 📖 **コミュの記憶**：シナリオライブラリを取り込むと、アイドルは**自分が登場した**正規ルートのコミュだけを思い出し、「あのときって……」という質問に答えられます。
- 🔄 **原作との同期**：ファン翻訳とミラー上の日本語原文をコマンド 1 つで同期し、新しいカードやイベントも 1 週間以内に思い出せます。楽曲・CD・ライブも彼女の世界設定に書き込まれます。
- 🧠 **キャラクター間で共有されるメモリー**：灯織に話したことは恋鐘も知っています。ただし「灯織から聞いたんだけど……」という口ぶりで持ち出します（[ADR-0002](docs/adr/0002-shared-memory-with-source-character.md)）。状況が変われば、新しいメモリーが古いものに取って代わります。覚えていることはすべて確認・削除できます。
- 🪪 **プロデューサープロフィール**：呼び方・性別・タイムゾーン・誕生日を設定画面で変えられ、すべての端末で共通です。誕生日当日にはお祝いしてくれます。
- ⚡ **必要なときだけ検索**：まず判断モデルがその発言に資料の検索が必要かを判断するので、雑談では余計な遅延がありません。

**デプロイと運用**

- 👥 **一般公開**：Google または GitHub でログイン。ユーザーごとに利用上限があり、ユーザー同士のメモリーは分離されています。ユーザーは自分のデータをすべて完全に削除でき、データベースは毎日暗号化して別の場所にバックアップします。
- 🔑 **自前の API キー**：ユーザーは自分の LLM・音声合成・音声認識のキーを登録して、自分のクレジットで使えます。自前の LLM を使ったテキストチャットは利用上限に数えられません。通話はどのキーを自前にすれば数えられないかをデプロイした人が選びます（初期状態は 3 つすべて。[設定ガイド](docs/configuration.ja.md#ログインとユーザーと利用上限)を参照）。キーを持たないユーザーもそのまま使え、利用上限に数えられるだけです。キーはユーザーのブラウザーにだけ保存されます（[ADR-0017](docs/adr/0017-own-api-keys-stay-in-the-browser.md)）。
- 🛠️ **管理画面**：ブラウザーで利用量・推定費用・進行中の通話を確認し、モデル・利用上限・単価を変更し（再起動不要）、ユーザーの利用停止や個別の利用上限の設定ができます。誰の会話・メモリー・プロフィール・好感度・プレゼントも見られません。好感度とプレゼントには判断モデルが必要で、初期状態でオン、単独でオフにもできます。判断モデルが誤判断したときは、ユーザー全員にリセットカードを 1 枚ずつ配れます。[設定ガイド](docs/configuration.ja.md#好感度とプレゼント)を参照してください。
- 🔌 **サービスは差し替え可能**：モデルは OpenAI Chat Completions・Responses・Anthropic Messages の 3 方式に対応。音声認識・ベクトル化・判断モデルはそれぞれ 2 社から選べます。
- 🚀 **ワンコマンドでデプロイ**：Caddy（HTTPS 自動化）と coturn（TURN 中継）入りの Docker Compose 本番構成を同梱。CI がイメージをビルドして GHCR に公開します。

## 🚀 クイックスタート

Docker と Docker Compose、そしてストリーミング出力とツール呼び出しに対応した会話モデルが必要です。

```sh
git clone https://github.com/Sallyn0225/eidolon-sc.git && cd eidolon-sc
cp .env.example .env    # CHAT_LLM_BASE_URL・CHAT_LLM_API_KEY・CHAT_LLM_MODEL を記入し、EIDOLON_DEV_LOGIN=1 の 1 行も追加
docker compose up --build
```

<http://localhost:3000> を開くとランディングページです。右上の「登录」（ログイン）を押し、ログインパネルで「开发登录」（開発ログイン）を選んで好きな名前を入れ、プライバシーポリシーと利用規約に同意し、13 歳以上であることを申告すると会話一覧に入ります。アイドルを選べば会話が始まります。

会話モデルだけを設定した状態ではテキストチャットができます。必要に応じてほかのサービスのキーを追加すれば、音声通話・コミュの記憶・メモリー・立ち絵が段階的に有効になります：

| 機能 | 必要な設定 |
|---|---|
| テキストチャット | `CHAT_LLM_*` |
| 音声通話 | `FISH_AUDIO_API_KEY` と音声認識のキー：`SONIOX_API_KEY`（デフォルト）または Alibaba Cloud Model Studio の `DASHSCOPE_API_KEY` |
| シナリオライブラリ | ベクトル化のキー：`SILICONFLOW_API_KEY`（デフォルト）または `GEMINI_API_KEY` |
| 検索とメモリー | ベクトル化のキー、`SILICONFLOW_API_KEY`（並べ替え用）、判断モデル：`JEV_API_KEY`（デフォルト）または Cloudflare の認証情報 |
| 立ち絵とあいさつ | `EIDOLON_STAND_ASSETS_URL` と素材を置くストレージバケット |

それぞれの設定方法と設定したときの効果は **[設定ガイド](docs/configuration.ja.md)** を、すべての環境変数の説明は [`.env.example`](.env.example) を参照してください。

## 🧩 アーキテクチャ

```mermaid
flowchart LR
    subgraph Browser["ブラウザ · Next.js"]
        Landing["ランディングページ"]
        UI["会話一覧 · 会話 · 通話画面"]
        Admin["管理画面"]
    end

    subgraph Backend["バックエンド · FastAPI + Pipecat"]
        API["HTTP API"]
        Call["通話パイプライン"]
        Engine["会話エンジン"]
        Retrieval["検索"]
        Memory["メモリー"]
        DB[("SQLite<br/>会話 · メモリー · シナリオライブラリ")]
    end

    Bucket[("オブジェクトストレージ<br/>立ち絵 · あいさつ")]

    UI -- "テキストのターン /api/*" --> API
    Admin --> API
    UI <-- "WebRTC 音声 + 字幕" --> Call
    Landing & UI -. "立ち絵、あいさつの音声" .-> Bucket
    API --> Engine
    Call -- "音声認識<br/>Soniox または Alibaba Cloud Model Studio" --> Engine
    Engine -- "Fish Audio 音声合成<br/>（読み表つき）" --> Call
    Engine --> Retrieval
    Engine --> Memory
    Retrieval --> DB
    Memory --> DB
    Engine <--> ChatLLM["会話モデル"]
    Retrieval <--> Judge["判断モデル<br/>Jev または Clef"]
    Retrieval <--> Emb["ベクトル化<br/>Qwen3-Embedding または Gemini"]
    Retrieval <--> SF["SiliconFlow<br/>Qwen3-Reranker"]
    Memory <--> BgLLM["バックグラウンドモデル"]
```

- 文字入力も音声も**同じ会話エンジン**を通り、同じ会話記録に書き込まれます。通話はエンジンの外側に音声認識と音声合成を被せただけのものです。
- 会話モデルは `<ja>…</ja><zh>…</zh>` の区切り形式でストリーミング出力し、日本語が届いた時点で音声合成に回すため、返事全体が終わるのを待つ必要がありません。

## 📚 ドキュメント

| ドキュメント | 内容 |
|---|---|
| [設定ガイド](docs/configuration.ja.md) | モデル、キャラクター、通話、立ち絵、シナリオライブラリ、検索、メモリー、ログイン、自前の API キー、管理画面の設定と効果 |
| [デプロイガイド](docs/deploy.md)（中国語） | VPS へのデプロイ：ドメイン、ファイアウォール、OAuth、シナリオライブラリの週次同期、立ち絵とあいさつの素材、アップグレード、バックアップと復元、トラブルシューティング |
| [`.env.example`](.env.example) | すべての環境変数とその説明 |
| [アーキテクチャ決定記録](docs/adr/) | なぜこう設計したか：日本語の声、共有メモリー、一般公開、自前のキーはブラウザーにだけ保存、など 17 件 |
| [`GLOSSARY.md`](GLOSSARY.md) | ドメイン用語集 |
| [`DESIGN.md`](DESIGN.md) · [`PRODUCT.md`](PRODUCT.md) | ビジュアル仕様 · プロダクトの位置づけ |

## 🌐 デプロイ

本番構成 [`docker-compose.prod.yml`](docker-compose.prod.yml) は caddy（HTTPS の入口）、frontend、backend、coturn（TURN 中継）の 4 つのサービスからなり、フロントエンドとバックエンドのイメージは CI が GHCR に公開します：

```sh
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

データベースは `deploy/db-backup.sh` が毎日暗号化して非公開のストレージバケットにバックアップし、30 日間保存します。詳しい手順は [デプロイガイド](docs/deploy.md)（中国語）を参照してください。

## 💻 開発

**バックエンド**（Python 3.11+、`backend/`、[uv](https://docs.astral.sh/uv/) を使用）：

```sh
cd backend
uv sync
uv run pytest && uv run pyright && uv run ruff check
uv run --env-file=../.env eidolon serve   # :8000 で起動し、../characters/characters.toml を読み込む
```

**フロントエンド**（Next.js 16 + [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS v4、`frontend/`）：

```sh
cd frontend
npm install
npm run typecheck && npm test && sh scripts/check-discipline.sh
npm run build && BACKEND_URL=http://localhost:8000 npm run start   # :3000 で起動し、/api/* をバックエンドへ転送
```

- **画面**：控えめな LINE 風のデザインで、彼女に属する場所には彼女のイメージカラーを使います。ランディングページは常にダークの、独立したビジュアルの世界です（[ADR-0016](docs/adr/0016-landing-page-is-its-own-visual-world.md)）。ビジュアル仕様は [`DESIGN.md`](DESIGN.md)、コンポーネントの書き方の決まりは [`frontend/AGENTS.md`](frontend/AGENTS.md) にあります。
- **立ち絵**：立ち絵を見るときは、フロントエンドにも `.env` と同じ `EIDOLON_STAND_ASSETS_URL` を渡します。
- **README のスクリーンショット**：フロントエンドとバックエンドを両方起動したあと、`frontend/` で `npm run readme-media` を実行すると、`docs/images/` のスクリーンショットとアニメーションを撮り直します。
- **CI**：PR と main へのプッシュごとに、GitHub Actions が上記のチェックと shellcheck を実行し、2 つのイメージをビルドします。main と `v*` タグへのプッシュでは GHCR に公開します。Dependabot が毎週月曜に依存関係の更新を提案します。

## 📁 ディレクトリ構成

```text
eidolon-sc/
├── backend/          # Python バックエンド：FastAPI + Pipecat。会話エンジン、通話、検索、メモリー、同期とコマンドライン（eidolon）
│   ├── src/eidolon/
│   ├── eval/         #   並べ替え・判断モデル・メモリーの評価用データセット（質問とラベルのみ、シナリオ本文は含まない）
│   └── tests/
├── frontend/         # Next.js フロントエンド：ランディングページ、会話、通話画面、設定、管理画面
├── characters/       # キャラクター設定、キャラクターシート、資料、アイコン、読み表、世界設定
├── corpus/           # シナリオデータとミラーのキャッシュ（リポジトリ外）
├── deploy/           # Caddyfile、シナリオライブラリと立ち絵の同期スクリプト、データベースのバックアップスクリプト
├── scripts/          # OAuth アプリ設定のウィザード（setup-oauth.sh）
├── docs/             # 設定ガイド、デプロイガイド、アーキテクチャ決定記録、README の画像
├── docker-compose.yml          # ローカル開発用
└── docker-compose.prod.yml     # 本番デプロイ用
```

## 📄 ライセンス

本プロジェクトのコードは [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）、または（あなたの選択により）それ以降の任意のバージョンの下で公開されています。本プロジェクトを改変してネットワーク経由で他者にサービスを提供する場合は、その利用者に改変後のソースコードを公開する必要があります。

ライセンスの対象はリポジトリ内のコードとドキュメントだけで、次のものは対象外です：

- **原作のコンテンツ**：シナリオデータ、キャラクター音声、立ち絵素材はリポジトリに含まれておらず、利用時はそれぞれの提供元の条件に従う必要があります（ADR-0003）。リポジトリ内のキャラクターシート・キャラクター資料・アイコンと README のスクリーンショットについても、キャラクターと設定は原作の権利者に帰属します。
- **Spine Runtimes**：通話画面の立ち絵に使う [`frontend/public/vendor/spine-3.6/`](frontend/public/vendor/spine-3.6/README.md) は無改変で収録しており、それ自身の Spine Runtimes ライセンスが適用されます（[ADR-0009](docs/adr/0009-spine-runtime-without-editor-license.md)）。[`LICENSING.md`](LICENSING.md) に AGPL 第 7 条の追加許可があり、両者を組み合わせて頒布することを認めています。
- **フォントと効果音**：ランディングページのフォントサブセットには SIL Open Font License が適用されます（`frontend/src/app/(landing)/fonts/` を参照）。通話の効果音の出典とライセンスは [`CREDITS.md`](frontend/public/sounds/CREDITS.md) を参照してください。

## 🙏 謝辞

- [LAPLACE Eidolon](https://laplace.live/eidolon)：VTuber・明前奶绿のために作られたリアルタイム音声 AI 分身。本プロジェクトのアーキテクチャの参考（コードは流用していません）
- [SCTranslationData](https://github.com/ShinyGroup/SCTranslationData)：シナリオテキストと中国語訳
- [ShinyColorsDB](https://github.com/ShinyColorsDB)：原文コミュのミラーと立ち絵素材
- [Pipecat](https://github.com/pipecat-ai/pipecat)：リアルタイム音声パイプラインと WebRTC 通信
- [Fish Audio](https://fish.audio/)：音声合成
- [Soniox](https://soniox.com/)、[Alibaba Cloud Model Studio](https://www.aliyun.com/product/bailian)：音声認識
- [SiliconFlow](https://siliconflow.cn/)：Qwen3 Embedding と Reranker
- [Google Gemini API](https://ai.google.dev/)：Gemini Embedding（選択できるベクトル化サービス）
- [TypeSafe Jev](https://docs.typesafe.ai/)、[OpenRouter](https://openrouter.ai/)、[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)：判断モデル
- [Spine Runtimes](https://github.com/EsotericSoftware/spine-runtimes)：立ち絵の再生（spine-ts 3.6）
- [im@sparql](https://sparql.crssnky.xyz/imas/)、Lantis、ふじわらはじめ、imas-db、wikiwiki：世界設定のアイドル・CD・ライブのデータ

<div align="center">

---

<sub>『アイドルマスター シャイニーカラーズ』およびそのキャラクターの著作権は ©Bandai Namco Entertainment Inc. に帰属します。本プロジェクトは非公式のファンメイド作品であり、権利者とは関係ありません。アイドルは AI が演じています。</sub>

</div>
