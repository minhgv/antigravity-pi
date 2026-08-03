# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI**
(`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

> **Cross-platform (macOS + Linux).** Bản này gộp hai nhánh cũ:
> - nhánh macOS (patch pi-ai `dist/`, candidate paths chỉ Homebrew/AICoworker), và
> - nhánh Linux VPS (vendor self-contained, thêm paths `/usr/lib`, `~/.local/lib`).
>
> Giờ là **một nguồn duy nhất**: vendor self-contained làm path chính (chạy được
> trên mọi platform, không cần patch node_modules), patch-global giữ làm fallback
> tuỳ chọn + mang theo các repair của nhánh macOS.

Provider `google-antigravity` dùng **Cloud Code Assist API** của Google
(`*.cloudcode-pa.googleapis.com`) với OAuth 2.0 PKCE. Native tool calling đi qua
động cơ `pi-ai` nên bảo toàn đầy đủ `read`/`write`/`edit`/`bash`.

---

## 🚀 Tính năng

- ⚡ **Native Tool Calling** qua động cơ `pi-ai`.
- 🔑 **OAuth 2.0 PKCE** (`pi login google-antigravity`).
- 📦 **Self-contained Vendor** — `vendor/` là snapshot khép kín, **không cần patch
  pi-ai** để chạy. Chi tiết: [🔧 Cách hoạt động](#-cách-hoạt-động) và `vendor/NOTICE.md`.
- 🍎🐧 **Cross-platform** — macOS (Homebrew, AICoworker, CrawBot, OpenClaw) &
  Linux (`/usr/lib`, `/usr/local/lib`, `~/.local/lib`, `npm root -g`).
- 🛠️ **Patch tuỳ chọn** — `npm run patch` chèn provider vào `dist/` pi-ai global
  (giữ các repair `supportsXhigh`, `createFauxCore`, `api-registry`… của nhánh macOS).

---

## 🔧 Cách hoạt động

`index.ts` load theo thứ tự:

1. **Vendor local (chính):** `import file://vendor/providers/google-gemini-cli.js`
   + `vendor/utils/oauth/google-antigravity.js`. Vendor self-contained → luôn
   resolve, không phụ thuộc pi-ai, không đụng node_modules global.
2. **Fallback pi-ai global:** nếu thiếu file vendor, dò candidate paths (mac + linux
   + `require.resolve`); nếu vẫn không có, auto-chạy `scripts/patch-global.js`.
3. **Fallback package specifier:** `@mariozechner/pi-ai/*` → `@earendil-works/pi-ai/*`.

**Vấn đề "displacement" (pi-ai ≥ 0.83):** `google-gemini-cli.js` /
`google-shared.js` import `./simple-options.js` và `./transform-messages.js` như
sibling trong `providers/`, nhưng pi-ai 0.83 dời chúng sang `dist/api/`.
- Path vendor: `scripts/sync-vendor-deps.js` copy chúng từ `api/` vào `vendor/providers/`.
- Path patch: `scripts/patch-global.js` copy chúng từ `dist/api/` vào `dist/providers/`.

**Bare specifier duy nhất:** `@google/genai` (dep của pi-ai, đã khai báo trong
`dependencies`).

---

## 📂 Cấu trúc

```text
pi-antigravity-native/
├── index.ts                       # vendor-first + cross-platform fallback
├── package.json
├── scripts/
│   ├── patch-global.js            # (tuỳ chọn) patch pi-ai dist + repairs + displacement
│   └── sync-vendor-deps.js        # re-sync vendor khi nâng cấp pi
├── vendor/                        # snapshot self-contained (xem vendor/NOTICE.md)
│   ├── NOTICE.md
│   ├── providers/  (google-gemini-cli, google-shared, simple-options, transform-messages, …)
│   ├── utils/      (oauth/*, event-stream, headers, sanitize-unicode, …)
│   ├── api/  auth/  models.js  models-store.js
└── README.md
```

---

## 🛠️ Cài đặt (macOS & Linux)

```bash
# 1. Clone về thư mục extensions của Pi
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/minhgv/pi-antigravity-native.git ~/.pi/agent/extensions/antigravity-native
cd ~/.pi/agent/extensions/antigravity-native

# 2. Cài dep (chủ yếu là @google/genai). Vendor self-contained → chạy được ngay.
npm install
```

> Không cần `npm run patch` để hoạt động. Chạy patch chỉ khi muốn load từ pi-ai
> `dist/` (fast-load) hoặc khi cần các repair `supportsXhigh`/`createFauxCore`…

### Khi nâng cấp pi/pi-ai lên bản lớn

```bash
npm run sync:vendor    # re-sync các file dep nội bộ pi-ai vào vendor
```

Nếu có breaking change ở API nội bộ pi-ai, có thể phải chỉnh vendor thủ công
(xem `vendor/NOTICE.md`).

---

## ⚙️ Cấu hình `~/.pi/agent/settings.json`

```jsonc
{
  "defaultModel": "google-antigravity/gemini-pro-agent",
  "smallModel": "google-antigravity/gemini-3-flash",
  "plugins": ["antigravity-native"]
}
```

Tuỳ chỉnh từng model qua `~/.pi/agent/models.json` (`google-antigravity` → `modelOverrides`):

```json
{
  "providers": {
    "google-antigravity": {
      "modelOverrides": {
        "gemini-3.6-flash-low": { "contextWindow": 272000, "maxTokens": 32768 }
      }
    }
  }
}
```

---

## 🎯 Sử dụng

```bash
pi login google-antigravity                 # OAuth lần đầu
pi                                          # model mặc định
pi --model google-antigravity/gemini-3.6-flash-low "Xin chào!"
pi --list-models | grep google-antigravity  # danh sách model
```

---

## 📜 Giấy phép

MIT. `vendor/` bundle file nội bộ của `@earendil-works/pi-ai` (cũng MIT) — xem
`vendor/NOTICE.md` để biết nguồn gốc & attribution.
