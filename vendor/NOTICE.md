# Vendor Notice

Thư mục `vendor/` là một **snapshot tự chứa (self-contained)** — mọi `import`/`require`
tương đối đều giải quyết được bên trong `vendor/` và không phụ thuộc `dist/` của
pi-ai lúc runtime (trừ bare specifier `@google/genai`, xem cuối file).

## 1. File custom của extension (Google Antigravity Native)

Provider Google Antigravity (Cloud Code Assist API) + OAuth 2.0 PKCE:

- `providers/google-gemini-cli.js` — implementation provider (stream, convert messages/tools…)
- `providers/google-shared.js` — helper dùng chung cho Google providers
- `utils/oauth/google-antigravity.js` — OAuth provider + refresh token
- `utils/oauth/oauth-page.js` — trang HTML cho OAuth flow
- `utils/oauth/pkce.js` — tiện ích PKCE

## 2. File phụ thuộc nội bộ của `@earendil-works/pi-ai` (MIT)

Được sao chép từ `@earendil-works/pi-ai@0.83.0` (`dist/`) để `google-gemini-cli.js`
import được (đường dẫn tương đối). Bao gồm:

- `models.js`, `models-store.js`
- `utils/event-stream.js`, `utils/headers.js`, `utils/sanitize-unicode.js`,
  `utils/estimate.js`, `utils/diagnostics.js`
- `api/lazy.js`
- `auth/context.js`, `auth/credential-store.js`, `auth/resolve.js`
- `providers/simple-options.js`, `providers/transform-messages.js` ← **displaced**

### Vì sao có hai file "displaced"

`google-gemini-cli.js` viết `import ... from "./simple-options.js"` và
`google-shared.js` viết `import ... from "./transform-messages.js"` (kỳ vọng nằm
cùng cấp `providers/`). Nhưng từ pi-ai 0.83.0, hai file này được dời sang
`dist/api/`. Do đó script sync copy chúng từ `dist/api/` vào `vendor/providers/`
để khớp import path (các import `../utils/*` bên trong vẫn khớp vì `api/` và
`providers/` cùng độ sâu).

## Bản quyền & giấy phép

File nhóm 2: bản quyền thuộc tác giả `@earendil-works/pi-ai`, giấy phép **MIT**.
<https://www.npmjs.com/package/@earendil-works/pi-ai>

Extension này cũng phát hành theo MIT. Việc bundle tuân thủ điều khoản MIT
(giữ notice/license). File `LICENSE` gốc của pi-ai không kèm trong gói npm; nếu
cần, xem tại repo上游.

## Bảo trì

Snapshot hiện tại khớp **pi-ai 0.83.0**. Khi nâng cấp pi lên bản lớn, chạy lại:

```bash
npm run sync:vendor
```

(`scripts/sync-vendor-deps.js`) để re-sync các file nhóm 2 từ pi-ai mới. Nếu có
breaking change ở API nội bộ (tên hàm export, signature…), vendor cũ có thể cần
chỉnh sửa thủ công.

## Bare specifier runtime duy nhất

Toàn bộ file vendor chỉ import một bare specifier ngoài: `@google/genai` (là
dependency của pi-ai, được resolve qua `peerDependencies` của extension hoặc qua
`node_modules` của pi-coding-agent). Đã khai báo trong `package.json` →
`dependencies` để fresh clone chạy `npm install` là đủ.
