# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

---

## 🎯 Tác dụng chính của Repository đối với Antigravity

Repository này đóng vai trò là cầu nối kỹ thuật cho phép **Google Antigravity 2.0 Native Engine** chạy trực tiếp và toàn diện trên môi trường **Pi CLI**, vượt qua các rào cản tương thích của API thông thường.

### 1. Các tác dụng chính (Core Benefits)

- ⚡ **Native Antigravity Transport & Streaming:** Kết nối trực tiếp tới endpoint CloudCode Sandbox của Google Antigravity (`daily-cloudcode-pa.sandbox.googleapis.com`) với giao thức SSE native, tốc độ cao và độ trễ thấp.
- 🛠️ **Bảo toàn 100% Native Tool Calling:** Giúp các mô hình Antigravity (`gemini-pro-agent`, `gemini-3.6-flash-high`) thực thi chuẩn xác các công cụ mặc định của Pi CLI (`read`, `write`, `edit`, `bash`) mà không gãy định dạng ToolCall.
- 🔑 **Quản lý Xác thực OAuth 2.0 PKCE:** Tích hợp luồng đăng nhập OAuth PKCE tự động (port `51121`), tự động làm mới access token (`refreshToken`) và xử lý Project ID (`summer-progress-g2w4j`).
- 📦 **Mở rộng Danh mục 20 Mô hình Antigravity:** Cung cấp cho Pi CLI khả năng truy cập catalog 20 mô hình bao gồm Gemini 3.1 Pro High/Low, Gemini 3.6 Flash, Gemini Flash Lite, Claude Opus Thinking (Experimental) và GPT-OSS.
- 🛡️ **Tự động Patch & Tự sửa lỗi Upstream:** Tự động phát hiện các cài đặt `@mariozechner/pi-ai` / `@earendil-works/pi-ai` trên hệ thống và sửa chữa triệt để các lỗi khuyết module/export upstream trên bản `pi-ai` 0.81.x.

### 2. Các hoạt động thực hiện (Key Operations & Workflows)

- 🔄 **Bơm Vendor Code (`scripts/patch-global.js`):** Tự động phát hiện đường dẫn `pi-ai` toàn cục và chèn các file xử lý Antigravity Native (`google-gemini-cli.js`, `google-shared.js`, `google-antigravity.js`, `pkce.js`, `oauth-page.js`) vào thư mục `dist/`.
- 🔧 **Khôi phục Module & Export Khuyết:** Tự động kiểm tra và khởi tạo `dist/api-registry.js`, bổ sung `supportsXhigh` trong `models.js`, `createFauxCore` trong `faux.js` và 8 Provider Factory exports (`amazonBedrockProvider`, `anthropicProvider`, `googleProvider`, `openaiProvider`,...) nếu bản `pi-ai` bị thiếu.
- 🔌 **Đăng ký Extension Runtime (`index.ts`):** Đăng ký provider `google-antigravity` vào Pi CLI qua `pi.registerProvider()`, gán mô hình mặc định `gemini-pro-agent`, thiết lập callback đăng nhập OAuth và cơ chế lấy API key.
- 🔀 **Ánh xạ Mô hình & Truyền tải Thinking:** Tự động re-map các alias (ví dụ `gemini-3.1-pro-high` → `gemini-pro-agent`), đồng thời truyền các cấu hình suy luận chuyên sâu (Reasoning / Thinking) lên hạ tầng Antigravity.

---

## 🚀 Tính năng nổi bật

- ⚡ **Native Tool Calling:** Sử dụng động cơ native `@mariozechner/pi-ai`, bảo toàn 100% khả năng gọi hàm (`read`, `write`, `edit`, `bash`) chuẩn xác.
- 🔑 **OAuth 2.0 PKCE Integration:** Hỗ trợ xác thực tài khoản Google Antigravity trực tiếp qua trình duyệt web.
- 📦 **Tích hợp sẵn Vendor Files:** Lưu trữ sẵn toàn bộ module Antigravity Native (`google-gemini-cli.js`, `google-antigravity.js`, `google-shared.js`, `oauth-page.js`, `pkce.js`) giúp patch tự động vào bộ `pi-ai` phổ thông.
- 🛠️ **Tự động Patch & Tự sửa lỗi Upstream:** Script patch tự động bơm vendor file, đồng thời tự động nhận diện và sửa lỗi khuyết export/module (`api-registry.js`, `supportsXhigh`, `createFauxCore`, provider factories) trên các phiên bản `pi-ai` 0.81.x phổ thông.

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
