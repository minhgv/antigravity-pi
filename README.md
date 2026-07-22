# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent`).

## Tính năng nổi bật

- ⚡ **Native Tool Calling:** Sử dụng động cơ `@mariozechner/pi-ai`, bảo toàn 100% khả năng gọi hàm (Read, Write, Edit, Bash) mà không bị gãy format.
- 🔑 **OAuth PKCE Integration:** Hỗ trợ luồng xác thực OAuth 2.0 PKCE cổng `51121` qua lệnh `/login`.
- 📦 **Đồng bộ 20 Mô hình:** Hỗ trợ đầy đủ danh mục mô hình Gemini 3 Pro High, Gemini 3 Flash, Claude Opus Thinking và GPT-OSS.
- 🛡️ **Fallback Cấu hình Linh hoạt:** Tự động phát hiện gói `@mariozechner/pi-ai` từ hệ thống hoặc ứng dụng OpenClaw/AICoworker/CrawBot.

## Cài đặt

### Cách 1: Cài đặt cho máy dùng standalone (Máy không có OpenClaw)

1. Cài đặt Pi CLI và thư viện `@mariozechner/pi-ai`:
   ```bash
   npm install -g @mariozechner/pi-coding-agent @mariozechner/pi-ai
   ```
2. Copy Extension vào thư mục extensions toàn cục:
   ```bash
   mkdir -p ~/.pi/agent/extensions/antigravity-native
   git clone https://github.com/minhgv/pi-antigravity-native.git ~/.pi/agent/extensions/antigravity-native
   ```

### Cách 2: Cài đặt trên máy đã có OpenClaw / AICoworker

Trường hợp máy đã cài sẵn OpenClaw/AICoworker, Extension sẽ tự động phát hiện và nạp module native từ ứng dụng mà không cần cài thêm gói gì!

---

## Cấu hình `~/.pi/agent/settings.json`

```json
{
  "defaultModel": "google-antigravity/gemini-pro-agent",
  "smallModel": "google-antigravity/gemini-3-flash"
}
```

## Khởi chạy

```bash
# Đăng nhập Google Antigravity OAuth lần đầu
pi login google-antigravity

# Khởi chạy mặc định với mô hình Gemini Pro High
pi

# Chỉ định mô hình cụ thể
pi --model google-antigravity/gemini-3-flash "Xin chào!"
```
