# Pi Antigravity Native Extension (`antigravity-pi`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

> **Cross-platform (macOS + Linux):**
> - **Vendor self-contained**: Chạy độc lập trên mọi nền tảng mà không cần vá (patch) `node_modules`.
> - **Fallback patch toàn cục**: Tuỳ chọn chèn provider vào `dist/` pi-ai global với đầy đủ các bản vá tương thích (`supportsXhigh`, `createFauxCore`, `api-registry`...).

Provider `google-antigravity` kết nối trực tiếp **Cloud Code Assist API** của Google (`*.cloudcode-pa.googleapis.com`) qua OAuth 2.0 PKCE. Cơ chế native tool calling chạy mượt mà trên động cơ `pi-ai`, hỗ trợ trọn vẹn toàn bộ công cụ cốt lõi (`read`, `write`, `edit`, `bash`) và subagents.

---

- ⚡ **Pure Native TypeScript Extension**: Chạy độc lập 100%, tuân thủ chuẩn Extension API của Pi (`dist/index.js`), không monkey-patch hay sửa đổi `node_modules` hệ thống.
- ⚡ **Prompt Cache Affinity & Trajectory Chaining**: Tạo 63-bit deterministic session ID từ user turn đầu tiên và xâu chuỗi `last_execution_id` giữa các turns, giúp tăng tỷ lệ hit prompt cache trên Google backend, giảm token input và tăng tốc phản hồi.
- 🚀 **Keep-Alive HTTP Connection & Prewarming**: Sử dụng custom Undici dispatcher (`keepAliveTimeout: 60s`) kết hợp kỹ thuật connection prewarming (`HEAD` request khi khởi động) để loại bỏ độ trễ TLS handshake ở các tool calls kế tiếp.
- 🧠 **Hỗ trợ Đa Dòng Mô Hình**: Hỗ trợ đầy đủ Gemini 3.8/3.7/3.6/3.5/3.1, Claude Sonnet/Opus 4.6 (Thinking), và GPT-OSS 120B kèm thinking level mapping (`low`, `medium`, `high`) và token clamping tự động.
- 🔑 **OAuth 2.0 PKCE & Headless Fallback**: Đăng nhập nhanh chóng, hỗ trợ headless paste URL cho môi trường SSH/VPS/Docker, tự động phân giải `projectId` thật của tài khoản Google.
- 🛡️ **Tự động Dereference Schema & Chuẩn Hóa Tool Calling**: Tự động đệ quy giải quyết `$ref`/`$defs` và loại bỏ các schema keywords không tương thích với Gemini backend.
- 🛠️ **Slash Commands Tích Hợp Sẵn**:
  - `/antigravity.usage`: Xem hạn mức quota theo thời gian thực (5h, weekly pool, thời gian reset).
  - `/antigravity.doctor`: Chẩn đoán trạng thái OAuth, endpoint tốt nhất và độ trễ mạng.
  - `/antigravity.models`: Xem danh sách toàn bộ các mô hình backend hiện có.
  - `/antigravity.image`: Sinh ảnh trực tiếp từ terminal qua mô hình Imagen / Gemini Image.
- 🧪 **Bộ Test Suite 42/42 Tests**: Bộ kiểm thử tự động toàn diện bao phủ toàn bộ stream, auth, cache, network và schema.

## 📋 Danh sách Models khả dụng (Available Models)

Provider `google-antigravity` cung cấp danh mục 20 mô hình Gemini active tối ưu cho lập trình:

### 🚀 Dòng Gemini 3.8 Flash (Sẵn sàng đón đầu)
| Model ID | Context Window | Max Output | Reasoning | Thinking Level | Mô tả |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `gemini-3.8-flash` | 1,048,576 (1M) | 65,535 | ✅ Có | LOW | Gemini 3.8 Flash bản tiêu chuẩn (sàn thinking LOW) |
| `gemini-3.8-flash-high` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | Gemini 3.8 Flash với tư duy chuyên sâu mức High |
| `gemini-3.8-flash-medium` | 1,048,576 (1M) | 65,535 | ✅ Có | MEDIUM | Gemini 3.8 Flash với tư duy cân bằng mức Medium |
| `gemini-3.8-flash-low` | 1,048,576 (1M) | 65,535 | ✅ Có | LOW | Gemini 3.8 Flash với tư duy phản hồi nhanh mức Low |

### 🌟 Gemini 3.7 Flash (Adaptive Thinking)
| Model ID | Context Window | Max Output | Reasoning | Thinking Level | Mô tả |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `gemini-3.7-flash-high` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | Gemini 3.7 Flash với tư duy chuyên sâu mức High |
| `gemini-3.7-flash-medium` | 1,048,576 (1M) | 65,535 | ✅ Có | MEDIUM | Gemini 3.7 Flash với tư duy cân bằng mức Medium |
| `gemini-3.7-flash-low` | 1,048,576 (1M) | 65,535 | ✅ Có | LOW | Gemini 3.7 Flash với tư duy phản hồi nhanh mức Low |

### ⚡ Gemini 3.1 Pro & Gemini 3.x Flash
| Model ID | Context Window | Max Output | Reasoning | Thinking Level | Ghi chú |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `gemini-pro-agent` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | **Model mặc định** (Gemini 3.1 Pro High) |
| `gemini-3.1-pro-high` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | Gemini 3.1 Pro High (Alias $\rightarrow$ `gemini-pro-agent`) |
| `gemini-3.1-pro-low` | 1,048,576 (1M) | 65,535 | ✅ Có | LOW | Gemini 3.1 Pro chế độ Low thinking |
| `gemini-3.6-flash-high` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | Gemini 3.6 Flash mức tư duy High |
| `gemini-3.6-flash-medium` | 1,048,576 (1M) | 65,535 | ❌ Không | MEDIUM | Gemini 3.6 Flash mức tư duy Medium |
| `gemini-3.6-flash-low` | 1,048,576 (1M) | 65,535 | ❌ Không | LOW | Gemini 3.6 Flash mức tư duy Low |
| `gemini-3-flash-agent` | 1,048,576 (1M) | 65,535 | ✅ Có | HIGH | Gemini 3.5 Flash Agent High thinking |
| `gemini-3.5-flash-low` | 1,048,576 (1M) | 65,535 | ✅ Có | MEDIUM | Gemini 3.5 Flash mức Medium |
| `gemini-3.5-flash-extra-low`| 1,048,576 (1M) | 65,535 | ✅ Có | LOW | Gemini 3.5 Flash mức Low |
| `gemini-3.5-flash-lite` | 1,048,576 (1M) | 65,535 | ❌ Không | - | Gemini 3.5 Flash Lite siêu nhanh (text-only) |
| `gemini-3-flash` | 1,048,576 (1M) | 65,535 | ✅ Có | Auto | Gemini 3 Flash bản tiêu chuẩn |
| `gemini-3.1-flash-lite` | 1,048,576 (1M) | 65,535 | ❌ Không | - | Gemini 3.1 Flash Lite text-only |
| `gemini-3.1-flash-image`| 1,000,000 (1M) | 64,000 | ❌ Không | - | Gemini 3.1 Flash Image tối ưu cho hình ảnh |

---

### ⚙️ Cơ chế Xử lý Thinking Level (Reasoning Effort Resolution)

1. **Hậu tố định danh (Suffix Resolution):**
   - ID chứa `-high` $\rightarrow$ `HIGH`
   - ID chứa `-medium` $\rightarrow$ `MEDIUM`
   - ID chứa `-low` hoặc `extra-low` $\rightarrow$ `LOW`
   - `gemini-pro-agent` / `*flash-agent` $\rightarrow$ `HIGH`
2. **Tự động kẹp mức MINIMAL $\rightarrow$ LOW trên Gemini 3.7+ (`isMinimalThinkingSupported`):**
   - Backend Antigravity của Google từ chối mức `MINIMAL` đối với các mô hình Gemini 3.7 trở lên (trả về lỗi `HTTP 400: Thinking level MINIMAL is not supported for this model`).
   - Extension tự động phát hiện phiên bản qua `isMinimalThinkingSupported(modelId)`: các mô hình Gemini 3.7+ khi yêu cầu mức `minimal` sẽ được tự động kẹp lên mức sàn an toàn là `LOW`.
   - Các thế hệ Gemini 3.6 trở xuống vẫn tiếp tục hỗ trợ mức `MINIMAL` bình thường.

---

## 🔧 Kiến trúc Native & Cơ chế Hoạt động

Extension được xây dựng hoàn toàn bằng **TypeScript Native**, biên dịch ra `dist/index.js` và nạp trực tiếp qua Pi Extension API (`pi.registerProvider`):
- **Không monkey-patching**: Tuyệt đối không can thiệp, vá lỗi hay sửa đổi file trong `node_modules` hay global packages.
- **Độc lập và an toàn**: Đầy đủ tính năng stream, OAuth PKCE, Undici HTTP Client, schema dereferencing tự thân.

### 9 Cơ chế Tương thích & Tối ưu Giao thức:
1. **Deterministic 63-bit Session ID & Trajectory Chaining:** Tạo Session ID cố định 63-bit (`deriveAntigravitySessionId`) từ user message đầu tiên và duy trì chuỗi phản hồi `last_execution_id` giúp tối đa hóa tỷ lệ trúng Prompt Cache của Google.
2. **Keep-Alive HTTP Client & Connection Prewarming:** Quản lý kết nối qua Undici với `keepAliveTimeout: 60s` và tự động gửi `HEAD` request khi khởi động để loại bỏ độ trễ TLS handshake (150–300ms).
3. **Recursive Schema Dereferencing:** Đệ quy giải phóng toàn bộ `$ref` và `$defs`, loại bỏ các schema keywords không tương thích để ngăn ngừa lỗi `HTTP 400 Bad Request` khi gọi tools.
4. **System Instruction Wrapper (`role: "user"` & `parts`):** Đóng gói System Instruction dưới cấu trúc `parts` tương thích backend Google Antigravity; **không chèn identity prompt** khi người dùng không cấu hình system prompt — đúng hành vi client chính thức.
5. **Sensitive-words Obfuscation:** Tự động tách các cụm từ nhạy cảm (mặc định `RFC 2119`, override qua `ANTIGRAVITY_SENSITIVE_WORDS`) bằng U+200B zero-width space để né matcher literal phía server trả về `429 RESOURCE_EXHAUSTED` trống — cùng mitigation với CLIProxyAPI.
6. **Client Version Auto-Tracking:** Lấy version client Antigravity mới nhất từ update manifest chính thức khi khởi động (fallback `2.8.0`, override qua `ANTIGRAVITY_HUB_VERSION`) — backend gate model theo version nên version cũ sẽ bị từ chối dần.
7. **Custom `requestId: "agent/..."`:** Tự sinh `requestId` tương thích với trace logging của Google Cloud Code Assist; **không gửi `requestType`** vì client chính thức bỏ trường này trên consumer Cloud Code (giá trị `"agent"` rơi vào bucket bị throttle cứng).
8. **Claude Thinking Beta Header:** Tự động chèn `anthropic-beta: interleaved-thinking-2025-05-14` khi gọi Claude qua Antigravity bridge.
9. **Multi-Scope OAuth PKCE & Auto Refresh:** Đăng nhập qua PKCE cổng `51121` với đầy đủ scopes, hỗ trợ Project ID fallback và tự động làm mới token.

---

## 📂 Cấu trúc Dự án

```text
antigravity-pi/
├── index.ts                       # Root re-export dist/index.js
├── package.json                   # Pi manifest ("pi": {"extensions": ["./dist/index.js"]})
├── tsconfig.json                  # TypeScript config (ES2022 / NodeNext)
├── dist/                          # Compiled native extension artifacts
│   └── index.js
├── src/                           # Native TypeScript source code
│   ├── index.ts                   # Extension entry point, commands & registration
│   ├── auth/                      # Headless OAuth PKCE & token management
│   ├── client/                    # Antigravity API client & Undici HTTP dispatcher
│   ├── diagnostics/               # Diagnostic commands (/antigravity.doctor, models)
│   ├── image/                     # Vision / image generation command
│   ├── models/                    # Model catalog & thinking level mappings
│   ├── stream/                    # SSE streaming response & tool-call handling
│   ├── types/                     # TypeScript interfaces & enums
│   ├── usage/                     # Quota discovery & usage tracking (/antigravity.usage)
│   └── utils/                     # HTTP, security, and schema dereferencing utilities
├── test/
│   └── antigravity.test.ts        # Comprehensive unit test suite (42 tests)
└── README.md
```

---

## 🛠️ Cài đặt & Sử dụng

### 1. Cài đặt Extension

```bash
# Clone vào thư mục extensions của Pi
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/minhgv/antigravity-pi.git ~/.pi/agent/extensions/antigravity-native
cd ~/.pi/agent/extensions/antigravity-native

# Cài đặt dependencies và biên dịch TypeScript
npm install
npm run build

# Chạy bộ kiểm thử tự động toàn diện (42 tests)
npm test
```

### 2. Cấu hình `~/.pi/agent/settings.json`

```jsonc
{
  "defaultModel": "google-antigravity/gemini-3.7-flash-high",
  "smallModel": "google-antigravity/gemini-3.7-flash-low",
  "plugins": ["antigravity-native"]
}
```

### 3. Đăng nhập & Sử dụng CLI

```bash
# Đăng nhập OAuth PKCE lần đầu
pi login google-antigravity

# Khởi động với model mặc định (Gemini 3.7 Flash High)
pi

# Khởi động với model cụ thể
pi --model google-antigravity/gemini-3.7-flash-high "Xin chào!"

# Liệt kê danh sách models khả dụng
pi --list-models | grep google-antigravity
```

---

## 🧪 Chạy Kiểm thử (Testing)

```bash
# Chạy bộ test suite 42 tests tự động kiểm tra stream, auth, cache, models và schema
npm test

# Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# Biên dịch lại extension
npm run build
```

---

## 📜 Giấy phép

MIT License. Bản quyền thuộc về Minh GV.

