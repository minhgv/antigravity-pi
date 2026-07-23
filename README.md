# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

---

## 🚀 Tính năng nổi bật

- ⚡ **Native Tool Calling:** Sử dụng động cơ native `@mariozechner/pi-ai`, bảo toàn 100% khả năng gọi hàm (`read`, `write`, `edit`, `bash`) chuẩn xác.
- 🔑 **OAuth 2.0 PKCE Integration:** Hỗ trợ xác thực tài khoản Google Antigravity trực tiếp qua trình duyệt web.
- 📦 **Tích hợp sẵn Vendor Files:** Lưu trữ sẵn toàn bộ module Antigravity Native (`google-gemini-cli.js`, `google-antigravity.js`, `google-shared.js`, `oauth-page.js`, `pkce.js`) giúp patch tự động vào bộ `pi-ai` phổ thông.
- 🛠️ **Tự động Patch & Fast Load:** Chạy script patch tự động bơm file vào module `pi-ai` global, tối ưu thời gian khởi động chỉ còn **~70ms-90ms**.

---

## 📂 Cấu trúc Repository

```text
pi-antigravity-native/
├── index.ts                   # Mã nguồn chính của Extension
├── package.json               # Cấu hình package & script patch
├── scripts/
│   └── patch-global.js        # Script tự động phát hiện và bơm vendor file vào pi-ai global
├── vendor/                    # Lưu trữ các file native Antigravity từ AICoworker/OpenClaw
│   ├── providers/
│   │   ├── google-gemini-cli.js
│   │   └── google-shared.js
│   └── utils/
│       └── oauth/
│           ├── google-antigravity.js
│           ├── oauth-page.js
│           └── pkce.js
└── README.md
```

---

## 🛠️ Hướng dẫn cài đặt & Patch cho bộ `pi-ai` phổ thông

### Bước 1: Clone Repository về thư mục extensions của Pi

```bash
mkdir -p ~/.pi/agent/extensions/antigravity-native
git clone https://github.com/minhgv/pi-antigravity-native.git ~/.pi/agent/extensions/antigravity-native
cd ~/.pi/agent/extensions/antigravity-native
```

### Bước 2: Chạy script Patch vào module `pi-ai` global

Chạy lệnh sau để tự động phát hiện và bơm các file Antigravity Native vào gói `pi-ai` toàn cục:

```bash
npm run patch
```

*Script sẽ tự động quét và patch vào các đường dẫn `pi-ai` phổ biến như:*
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-ai`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai`
- Thư mục `npm root -g` trên Linux/macOS/Windows

---

## ⚙️ Cấu hình `~/.pi/agent/settings.json`

Thêm cấu hình mô hình Antigravity vào file cấu hình cá nhân:

```json
{
  "defaultModel": "google-antigravity/gemini-pro-agent",
  "smallModel": "google-antigravity/gemini-3-flash"
}
```

---

## 🎯 Sử dụng

```bash
# 1. Đăng nhập Google Antigravity OAuth lần đầu
pi login google-antigravity

# 2. Khởi chạy mặc định với Gemini Pro High
pi

# 3. Chỉ định mô hình cụ thể
pi --model google-antigravity/gemini-3-flash "Xin chào!"
```
