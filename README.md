# FlowSheet

No more paperwork. Just do it online. By a debator, for debators.

## オフライン対応 (PWA)

このアプリは Progressive Web App として動作します。HTTPS でホストするか、ローカルで Live Server などを使って開くと、初回アクセス後はオフラインでも利用できます。

- 追加ファイル: `manifest.webmanifest`, `service-worker.js`
- アイコンは `icons/icon-192.png` と `icons/icon-512.png` を配置してください（プレースホルダあり）。
- ブラウザの「ホーム画面に追加」からインストールが可能です。

開発中にキャッシュが残って挙動が変な時は、ブラウザのアプリケーション/サービスワーカーからキャッシュを削除してリロードしてください。
