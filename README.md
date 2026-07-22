# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent`).

## Tính năng nổi bật

- ⚡ **Native Tool Calling:** Ủy quyền trực tiếp cho bộ Provider `@mariozechner/pi-ai` của OpenClaw, bảo toàn 100% khả năng gọi hàm (Read, Write, Edit, Bash).
- 🔑 **OAuth PKCE Integration:** Hỗ trợ luồng xác thực OAuth 2.0 PKCE cổng `51121` qua lệnh `/login`.
- 📦 **Đồng bộ 20 Mô hình:** Hỗ trợ đầy đủ danh mục mô hình Gemini 3 Pro High, Gemini 3 Flash, Claude Opus Thinking và GPT-OSS.
- 🛠️ **Wire Model Mapping:** Tự động ánh xạ `gemini-3.1-pro-high` về `gemini-pro-agent`, khắc phục dứt điểm lỗi HTTP 400.

## Cài đặt

Coppy toàn bộ tệp của Extension vào thư mục extensions toàn cục của Pi CLI:

```bash
mkdir -p ~/.pi/agent/extensions/antigravity-native
```

## Cấu hình `~/.pi/agent/settings.json`

```json
{
  "defaultModel": "google-antigravity/gemini-pro-agent",
  "smallModel": "google-antigravity/gemini-3-flash"
}
```

## Khởi chạy

```bash
# Khởi chạy mặc định với mô hình Gemini Pro High
pi

# Chỉ định mô hình cụ thể
pi --model google-antigravity/gemini-3-flash "Xin chào!"
```
