# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

> **Lưu ý:** Giao thức Google Antigravity OAuth là giải pháp tích hợp native dựa trên endpoint Sandbox CloudCode (`daily-cloudcode-pa.sandbox.googleapis.com`). Cần tuân thủ quy định sử dụng tài khoản cá nhân.

---

## 🎯 Tác dụng chính của Repository đối với Antigravity

Repository này đóng vai trò là cầu nối kỹ thuật cho phép **Google Antigravity 2.0 Native Engine** kết nối và hoạt động trên môi trường **Pi CLI**.

### 1. Các tác dụng chính (Core Benefits)

- ⚡ **Native Antigravity Transport & Streaming:** Kết nối trực tiếp tới endpoint CloudCode Sandbox của Google Antigravity (`daily-cloudcode-pa.sandbox.googleapis.com`) với giao thức SSE native.
- 🛠️ **Tích hợp Native Tool Calling:** Giúp các mô hình Gemini Antigravity (`gemini-pro-agent`, `gemini-3.6-flash-high`) thực thi các công cụ mặc định của Pi CLI (`read`, `write`, `edit`, `bash`) theo chuẩn định dạng của Pi.
- 🔑 **Quản lý Xác thực OAuth 2.0 PKCE:** Tích hợp luồng đăng nhập OAuth PKCE tự động (port `51121`), tự động làm mới access token (`refreshToken`) và xử lý Project ID (`summer-progress-g2w4j`).
- 📦 **Đăng ký Catalog Mô hình Antigravity:** Cung cấp cho Pi CLI danh mục mô hình Gemini (Đã kiểm thử) cùng các mô hình thử nghiệm như Claude Opus Thinking và GPT-OSS (Experimental).
- 🛡️ **Tự động Bù đắp Export Khuyết:** Phát hiện các cài đặt `@mariozechner/pi-ai` / `@earendil-works/pi-ai` và bổ sung các export/module còn thiếu trên phiên bản `pi-ai` 0.81.x để đảm bảo Pi CLI nạp mượt mà.

### 2. Các hoạt động thực hiện (Key Operations & Workflows)

- 🔄 **Bơm Vendor Code (`scripts/patch-global.js`):** Phát hiện đường dẫn `pi-ai` toàn cục và chèn các file xử lý Antigravity Native (`google-gemini-cli.js`, `google-shared.js`, `google-antigravity.js`, `pkce.js`, `oauth-page.js`) vào thư mục `dist/`.
- 🔧 **Kiểm tra & Bù đắp Module Khuyết:** Tự động kiểm tra và tạo `dist/api-registry.js`, bổ sung `supportsXhigh` trong `models.js`, `createFauxCore` trong `faux.js` và 8 Provider Factory exports (`amazonBedrockProvider`, `anthropicProvider`, `googleProvider`, `openaiProvider`,...) nếu bản `pi-ai` bị khuyết.
- 🔌 **Đăng ký Extension Runtime (`index.ts`):** Đăng ký provider `google-antigravity` vào Pi CLI qua `pi.registerProvider()`, gán mô hình mặc định `gemini-pro-agent`, thiết lập callback đăng nhập OAuth và cơ chế lấy API key.
- 🔀 **Ánh xạ Mô hình & Truyền tải Thinking:** Tự động re-map các alias (ví dụ `gemini-3.1-pro-high` → `gemini-pro-agent`), đồng thời truyền các cấu hình suy luận chuyên sâu (Reasoning / Thinking) lên hạ tầng Antigravity.

---

## 🚀 Tính năng nổi bật

- ⚡ **Native Tool Calling:** Sử dụng động cơ native `@mariozechner/pi-ai`, duy trì khả năng gọi hàm (`read`, `write`, `edit`, `bash`).
- 🔑 **OAuth 2.0 PKCE Integration:** Hỗ trợ xác thực tài khoản Google Antigravity trực tiếp qua trình duyệt web.
- 📦 **Tích hợp sẵn Vendor Files:** Lưu trữ sẵn toàn bộ module Antigravity Native (`google-gemini-cli.js`, `google-antigravity.js`, `google-shared.js`, `oauth-page.js`, `pkce.js`) giúp patch tự động vào gói `pi-ai` phổ thông.
- 🛠️ **Tự động Patch & Kiểm tra Tương thích:** Script patch tự động bơm vendor file và bổ sung các export còn thiếu trong gói `pi-ai` 0.81.x toàn cục.

---

## 📂 Cấu trúc Repository

```text
pi-antigravity-native/
├── index.ts                   # Mã nguồn chính của Extension
├── package.json               # Cấu hình package & script patch
├── scripts/
│   └── patch-global.js        # Script tự động phát hiện, bơm vendor file và sửa lỗi pi-ai global
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

Chạy lệnh sau để tự động phát hiện, vá module và bơm các file Antigravity Native vào gói `pi-ai` toàn cục:

```bash
npm run patch
```

*Script sẽ tự động quét và patch/bổ sung vào các đường dẫn `pi-ai` phổ biến như:*
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
