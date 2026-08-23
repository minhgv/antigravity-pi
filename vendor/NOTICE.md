# Vendor Notice

Thư mục `vendor/` là một **snapshot tự chứa (self-contained)** — mọi `import`/`require` tương đối đều được giải quyết nội bộ bên trong `vendor/` mà không bắt buộc phụ thuộc vào `dist/` của `pi-ai` lúc runtime (trừ bare specifier duy nhất `@google/genai`, xem mục 4).

---

## 1. File Custom của Extension (Google Antigravity Native Provider)

Bao gồm mã nguồn triển khai tích hợp trực tiếp **Cloud Code Assist API** của Google với OAuth 2.0 PKCE, Token Auto-Rotation và Thinking Level Resolution:

- `providers/google-gemini-cli.js`:
  - Triển khai provider chính (`streamSimple`, `stream`, chuyển đổi schema tools & messages).
  - Tích hợp 8 cơ chế tương thích Antigravity (System Instruction `[ignore]` packaging, `requestType: "agent"`, `userAgent: "antigravity"`, trace `requestId`, User-Agent 3 chế độ `cli`/`sdk`/`desktop`, Sandbox Cascade Endpoints).
  - Xuất các helper suy luận & phân giải cấp độ tư duy (`getDefaultThinkingLevel`, `getGeminiCliThinkingLevel`, `isMinimalThinkingSupported`, `isGemini3ProModel`, `isGemini3FlashModel`, `isGemini3Model`).
  - Xử lý tự động kẹp (clamp) mức sàn tư duy an toàn `LOW` trên Gemini 3.7+ loại bỏ lỗi backend `HTTP 400 (Thinking level MINIMAL is not supported)`.
- `providers/google-shared.js`: Module tiện ích dùng chung cho các bộ chuyển đổi Google.
- `utils/oauth/google-antigravity.js`: Cơ chế OAuth 2.0 PKCE (cổng `51121`), xử lý 401 Force-Refresh & Single-Flight Token Rotation, ghi ngược credential đã xoay vòng vào `~/.pi/agent/auth.json` (chmod `0600`).
- `utils/oauth/oauth-page.js`: Giao diện HTML hiển thị cho callback xác thực OAuth.
- `utils/oauth/pkce.js`: Tiện ích tạo verifier & challenge cho luồng PKCE.

---

## 2. File Phụ thuộc Kế thừa từ `@earendil-works/pi-ai` (MIT)

Được snapshot từ `@earendil-works/pi-ai` (`dist/`) để đảm bảo các module trong `vendor/providers/` có thể import độc lập mà không phụ thuộc vào `node_modules` toàn cục:

- `models.js`, `models-store.js`
- `utils/event-stream.js`, `utils/headers.js`, `utils/sanitize-unicode.js`, `utils/estimate.js`, `utils/diagnostics.js`
- `api/lazy.js`
- `auth/context.js`, `auth/credential-store.js`, `auth/resolve.js`
- `providers/simple-options.js`, `providers/transform-messages.js` (*displaced files*)

### Về các file "Displaced" (từ pi-ai ≥ 0.83)
Trong các bản pi-ai gần đây, `simple-options.js` và `transform-messages.js` được di chuyển từ `providers/` sang `dist/api/`. Snapshot vendor đặt bản sao của chúng trực tiếp tại `vendor/providers/` để khớp hoàn hảo với các lệnh import tương đối mà không làm gãy đường dẫn.

---

## 3. Bản quyền & Giấy phép (Copyright & License)

- **Các file nhóm 1 (Custom Antigravity Provider)**: Thuộc dự án `pi-antigravity-native`, phát hành theo giấy phép **MIT License**.
- **Các file nhóm 2 (Kế thừa từ pi-ai)**: Bản quyền thuộc các tác giả và cộng đồng đóng góp của `@earendil-works/pi-ai` / `@mariozechner/pi-ai`, phát hành theo giấy phép **MIT License**.
  - Chi tiết gói upstream: [npm:@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)

Việc đóng gói (bundle) snapshot nội bộ tuân thủ đầy đủ các điều khoản phân phối lại của giấy phép MIT.

---

## 4. Bare Specifier Runtime Duy Nhất

Toàn bộ thư mục `vendor/` chỉ phụ thuộc duy nhất một bare specifier bên ngoài:
- **`@google/genai`**: Dependency chính thức của Google Gemini API, đã được khai báo tại `dependencies` trong `package.json` để sẵn sàng sử dụng ngay sau `npm install`.

---

## 5. Quy trình Đồng bộ & Bảo trì (Maintenance)

Khi nâng cấp phiên bản `pi` / `pi-ai` trên hệ thống, có thể chạy lại script đồng bộ:

```bash
npm run sync:vendor
```

Sau khi đồng bộ, chạy bộ test suite để đảm bảo tính toàn vẹn của 16 core models:

```bash
npm run test:models
```
