# Pi Antigravity Native Extension (`antigravity-pi`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Pi Extension](https://img.shields.io/badge/Pi%20Extension-100%25%20Native-brightgreen.svg)](https://github.com/mariozechner/pi-coding-agent)
[![Tests](https://img.shields.io/badge/Tests-68%2F68%20Passing-success.svg)](test/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Extension tích hợp **Google Antigravity Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

Provider `antigravity` (alias `google-antigravity`) kết nối trực tiếp đến **Cloud Code Assist API** của Google (`*.cloudcode-pa.googleapis.com`) qua OAuth 2.0 PKCE. Cơ chế native tool calling chạy mượt mà trên động cơ `pi-ai`, hỗ trợ trọn vẹn toàn bộ công cụ cốt lõi (`read`, `write`, `edit`, `bash`), multi-turn streaming, subagents, và sinh ảnh Imagen/Gemini.

---

## ✨ Điểm Nổi Bật (Key Features)

- ⚡ **Pure Native TypeScript Extension**: Chạy độc lập 100%, tuân thủ chuẩn Extension API của Pi (`dist/index.js`), tuyệt đối không monkey-patch hay sửa đổi `node_modules` hệ thống.
- 🛡️ **Bảo Vệ Google One AI Credits**: Tự động loại bỏ `enabledCreditTypes` ("GOOGLE_ONE_AI") theo mặc định để ngăn trừ tiền credits đã mua của tài khoản Google One. Tuỳ chọn bật/tắt an toàn qua biến môi trường.
- 🧬 **Thought Signature Replay Cache & Fallback**: Giải quyết triệt để lỗi `HTTP 400 Bad Request` (*"Missing thought signature"* / *"Invalid signature"*) trên các mô hình Gemini 3+ và reasoning models khi gọi tool qua nhiều turns hoặc chuyển đổi model giữa chừng.
- 🔗 **Prompt Cache Affinity & Trajectory Chaining**: Tạo 63-bit deterministic session ID (`deriveAntigravitySessionId`) từ user turn đầu tiên và xâu chuỗi `last_execution_id` giữa các turns, giúp tối đa hóa tỷ lệ trúng Prompt Cache trên hạ tầng Google, tiết kiệm token và tăng tốc phản hồi.
- 🥷 **Sensitive-Words Obfuscation**: Tự động chèn ký tự zero-width space (U+200B) vào các cụm từ nhạy cảm (như `RFC 2119`, `<system-directive>`, `conventions`...) nhằm vượt qua bộ lọc literal matcher phía máy chủ gây lỗi `429 RESOURCE_EXHAUSTED` ảo.
- 🔄 **Intelligent Retry & Auto Fallback**: Tự động trích xuất độ trễ chờ qua `extractRetryDelay` (xử lý `Retry-After`, `x-ratelimit-reset-after`, và inline JSON `retryDelay`), áp dụng jitter sleep khi bị rate limit, và tuỳ chọn tự động fallback model khi gặp mã lỗi 404/429.
- 🎭 **Tool Cloaking & Decoy Tools**: Hỗ trợ ngụy trang tên công cụ với hậu tố `_ide` (`PI_AGY_CLOAK_TOOLS=1`) và chèn các decoy tools (`PI_AGY_DECOY_TOOLS=1`) khi cần thiết.
- 🚀 **Keep-Alive HTTP Connection & Prewarming**: Sử dụng custom Undici dispatcher (`keepAliveTimeout: 60s`) kết hợp kỹ thuật prewarming kết nối (`HEAD` request khi khởi động) để loại bỏ độ trễ TLS handshake (150–300ms).
- 💾 **Hệ Thống Cache Đa Tầng**:
  - **Session State Cache**: Lưu trữ trạng thái phiên xuống ổ đĩa (`~/.pi/agent/cache/antigravity-sessions.json`) với cơ chế LRU eviction (>200 sessions).
  - **Model Cache**: Tự động cache thông tin runtime models (TTL 30 phút, in-flight request deduplication).
  - **Project ID Cache**: Tự động cache Project ID đã phân giải (TTL 30 phút, LRU).
- 🎨 **Image Generation Sẵn Có**: Slash command `/antigravity.image` và agent tool `generate_image` giúp sinh ảnh trực tiếp từ terminal qua mô hình Imagen / Gemini Image.
- 🛠️ **Bộ Công Cụ Diagnostics Toàn Diện**: `/antigravity.usage`, `/antigravity.doctor`, `/antigravity.models`.
- 🧪 **Bộ Test Suite 68/68 Tests**: Kiểm thử tự động toàn diện bao phủ toàn bộ stream, auth, cache, network, security, retry delays và schema transformations.

---

## 📋 Danh Sách Models Khả Dụng (Available Models)

Extension cung cấp danh mục các mô hình Google Antigravity active tối ưu cho lập trình:

| Model ID | Context Window | Max Output | Reasoning Support | Thinking Levels Hỗ Trợ | Mô Tả & Backend Runtime Mapping |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `gemini-3.8-flash` | 1,048,576 (1M) | 65,536 | ✅ Có | `low`, `medium`, `high` | Gemini 3.8 Flash thế hệ mới (Maps $\rightarrow$ `gemini-3.8-flash-{low/medium/high}`) |
| `gemini-3.7-flash` | 1,048,576 (1M) | 65,536 | ✅ Có | `low`, `medium`, `high` | Gemini 3.7 Flash Thinking (Maps $\rightarrow$ `gemini-3.7-flash-{low/medium/high}`) |
| `gemini-3.6-flash` | 1,048,576 (1M) | 65,536 | ✅ Có | `low`, `medium`, `high` | Gemini 3.6 Flash (Maps $\rightarrow$ `gemini-3.6-flash-{low/medium/high}`) |
| `gemini-3.5-flash` | 1,048,576 (1M) | 65,536 | ✅ Có | `low`, `medium`, `high` | Gemini 3.5 Flash (Maps $\rightarrow$ `gemini-3.5-flash-extra-low` / `gemini-3-flash-agent`) |
| `gemini-3.1-pro` | 1,048,576 (1M) | 65,535 | ✅ Có | `low`, `high` | Gemini 3.1 Pro (Maps $\rightarrow$ `gemini-3.1-pro-low` / `gemini-pro-agent`) |
| `claude-opus-4-6` | 250,000 | 64,000 | ✅ Có | `high` (thinking) | Claude Opus 4.6 Thinking qua Antigravity bridge |
| `claude-sonnet-4-6` | 200,000 | 64,000 | ✅ Có | `high` (thinking) | Claude Sonnet 4.6 Thinking qua Antigravity bridge |
| `gpt-oss-120b` | 131,072 | 32,768 | ✅ Có | `medium` | GPT-OSS 120B mã nguồn mở chạy trên hạ tầng Google |

---

### ⚙️ Cơ Chế Xử Lý Thinking Effort (Reasoning Routing)

1. **Routing Tự Động Theo Mức Tư Duy (Effort Mapping):**
   - Pi CLI quản lý mức reasoning thông qua tham số cấu hình (`--thinking low|medium|high|xhigh`).
   - Extension tự động phân giải cấu hình sang các Runtime Model ID tương ứng phía backend của Google (ví dụ: `gemini-3.1-pro` với thinking `high` sẽ được điều hướng mượt mà sang runtime `gemini-pro-agent`).
2. **Tự Động Kẹp Mức MINIMAL $\rightarrow$ LOW:**
   - Backend Antigravity từ chối mức `MINIMAL` đối với các mô hình Gemini 3.7+ (trả về lỗi `HTTP 400`).
   - Extension tự động chuẩn hoá các mức reasoning sàn về `LOW` an toàn, ngăn ngừa crash phiên làm việc.
3. **Claude Interleaved Thinking Header:**
   - Khi gọi các mô hình Claude reasoning, extension tự động đính kèm header `anthropic-beta: interleaved-thinking-2025-05-14`.

---

## 🔧 Các Cơ Chế Kỹ Thuật Cốt Lõi (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                          Pi CLI                             │
│       (@mariozechner/pi-coding-agent / @earendil-works)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Extension API (registerProvider)
┌──────────────────────────────▼──────────────────────────────┐
│                    antigravity-pi                           │
│  ┌───────────────────┐  ┌───────────────────┐  ┌──────────┐ │
│  │   Auth / OAuth    │  │  Stream & Parser  │  │  Models  │ │
│  │     (PKCE 51121)  │  │ (SSE + Signature) │  │  Catalog │ │
│  └─────────┬─────────┘  └─────────┬─────────┘  └────┬─────┘ │
│            │                      │                 │       │
│  ┌─────────▼──────────────────────▼─────────────────▼─────┐ │
│  │  Trajectory Chaining / Disk State / Multi-Tier Cache   │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │ Undici Connection Prewarming │
└───────────────────────────────┼─────────────────────────────┘
                                │ HTTPS / Keep-Alive (60s)
┌───────────────────────────────▼─────────────────────────────┐
│             Google Cloud Code Assist Backend                │
│             (*.cloudcode-pa.googleapis.com)                 │
└─────────────────────────────────────────────────────────────┘
```

1. **Thought Signature Replay Cache (`thought-signature.ts`):**
   - Quản lý bộ nhớ đệm in-memory (FIFO 2048 entries) lưu lại signature của từng tool call theo session.
   - Khi thực hiện multi-turn replay hoặc chuyển đổi giữa các model trong cùng một phiên hội thoại, signature tương ứng sẽ được tái tạo hoặc fallback về `DEFAULT_THINKING_AG_SIGNATURE` an toàn.
2. **Deterministic 63-bit Session ID & Trajectory Chaining (`util.ts`):**
   - Sinh Session ID 63-bit âm (`-${hash}`) duy nhất từ lượt hội thoại user đầu tiên.
   - Duy trì `trajectory_id`, tăng dần `last_step_index`, và xâu chuỗi `last_execution_id` qua từng turn để Google Cloud Code Assist nhận diện phiên và hit Prompt Cache.
3. **Sensitive Words Obfuscation (`util.ts`):**
   - Phân tích và chia nhỏ các cụm từ nhạy cảm (`RFC 2119`, `<system-directive>`, `conventions`, v.v.) bằng ký tự U+200B zero-width space trước khi gửi tới API.
4. **Schema Dereferencing & Sanitization (`security.ts`):**
   - Tự động đệ quy tháo gỡ toàn bộ `$ref` và `$defs`, làm sạch các meta keywords không tương thích trong JSON Schema của tools trước khi gửi lên Gemini/Claude backend.
5. **Intelligent Retry Delay & Burst Protection (`stream.ts`):**
   - Phân tích chính xác `Retry-After`, `x-ratelimit-reset-after`, và body JSON `retryDelay` để nghỉ trước khi retry, kết hợp jitter sleep chống nghẽn thắt cổ chai.

---

## 🛠️ Slash Commands & Tools Tích Hợp

### 1. Slash Commands trong Terminal
- `/antigravity.usage`: Xem chi tiết hạn mức quota theo thời gian thực (5h pool, weekly pool, thời gian reset của từng nhóm model).
- `/antigravity.doctor`: Chẩn đoán trạng thái provider, endpoint đang dùng, Project ID, latency và mã lỗi gần nhất.
- `/antigravity.models [all]`: Liệt kê danh sách runtime models khả dụng và tỷ lệ quota còn lại.
- `/antigravity.image [--ratio 16:9] [--model gemini-3-pro-image] [--path output.png] <prompt>`: Sinh ảnh trực tiếp từ dòng lệnh.

### 2. Built-in Agent Tool
- `generate_image`: Agent có thể tự động gọi tool này để tạo ảnh minh họa khi được yêu cầu, tự động lưu vào `.pi/generated-images/` hoặc đường dẫn chỉ định.

---

## ⚙️ Biến Môi Trường (Environment Variables)

| Biến Môi Trường | Giá Trị Mặc Định | Mô Tả |
| :--- | :---: | :--- |
| `PI_AGY_ENABLE_G1_CREDITS`<br/>*(hoặc `OPENCODE_AGY_ENABLE_G1_CREDITS`)* | `0` (Tắt) | Đặt thành `1` nếu bạn muốn cho phép sử dụng Google One AI Credits đã mua khi quota miễn phí cạn kiệt. |
| `PI_AGY_AUTO_FALLBACK`<br/>*(hoặc `OPENCODE_AGY_AUTO_FALLBACK`)* | `0` (Tắt) | Đặt thành `1` để tự động chuyển sang model thấp hơn (3.8 $\rightarrow$ 3.7 $\rightarrow$ 3.6) khi gặp lỗi 404 hoặc 429. |
| `PI_AGY_CLOAK_TOOLS`<br/>*(hoặc `OPENCODE_AGY_CLOAK_TOOLS`)* | `0` (Tắt) | Đặt thành `1` để ngụy trang tên tool với hậu tố `_ide` (tránh bộ lọc hạn chế tool calling). |
| `PI_AGY_DECOY_TOOLS`<br/>*(hoặc `OPENCODE_AGY_DECOY_TOOLS`)* | `0` (Tắt) | Đặt thành `1` để chèn thêm các decoy IDE function declarations vào request. |
| `PI_AGY_SENSITIVE_WORDS`<br/>*(hoặc `ANTIGRAVITY_SENSITIVE_WORDS`)* | Danh sách mặc định | Chuỗi các từ nhạy cảm cần obfuscate, phân tách bởi dấu phẩy `,`. Đặt thành rỗng `""` để tắt tính năng này. |
| `ANTIGRAVITY_BASE_URL` | Cloud Code PA | Endpoint API tuỳ chỉnh (phải thuộc domain an toàn của Google). |
| `ANTIGRAVITY_PROJECT_ID` | Auto Discovery | Ghi đè Project ID thật của tài khoản Google Cloud. |
| `ANTIGRAVITY_HUB_VERSION` | Manifest / 2.8.0 | Ghi đè version client Antigravity để phục vụ model gating. |
| `ANTIGRAVITY_NO_PREWARM` | `0` (Prewarm bật) | Đặt thành `1` để tắt việc gửi prewarming HEAD request lúc khởi động. |
| `ANTIGRAVITY_SESSIONS_FILE` | `~/.pi/agent/cache/...` | Đường dẫn tuỳ chỉnh lưu trữ session state file. |

---

## 📂 Cấu Trúc Dự Án (Project Structure)

```text
antigravity-pi/
├── index.ts                       # Entry point re-exporting dist/index.js
├── package.json                   # Pi manifest ("pi": {"extensions": ["./dist/index.js"]})
├── tsconfig.json                  # TypeScript configuration (ES2022 / NodeNext)
├── dist/                          # Biên dịch native extension artifacts
│   └── index.js
├── src/
│   ├── index.ts                   # Extension setup, commands & tool registrations
│   ├── auth/                      # Headless OAuth PKCE, tokens & Project ID discovery
│   ├── client/                    # Client metadata, version manifests, headers & endpoints
│   ├── diagnostics/               # Chẩn đoán kết nối (/antigravity.doctor)
│   ├── image/                     # Xử lý sinh ảnh (/antigravity.image & generate_image tool)
│   ├── models/                    # Model catalog, thinking level mappings & fallback routing
│   ├── stream/                    # SSE Parser, Thought Signature Cache & Tool calling stream
│   ├── types/                     # TypeScript interfaces, schemas & enums
│   ├── usage/                     # Kiểm tra quota & pools (/antigravity.usage, /antigravity.models)
│   └── utils/                     # HTTP Keep-Alive, security scrubbers, session persistence
├── test/
│   ├── antigravity.test.ts        # Unit test suite toàn diện cho stream, auth, security & models
│   └── cache.test.ts              # Unit test suite cho modelCache, projectCache & sessionState
└── README.md
```

---

## 🚀 Cài Đặt & Sử Dụng (Installation & Usage)

### 1. Cài đặt Extension

```bash
# Clone vào thư mục extensions của Pi
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/minhgv/antigravity-pi.git ~/.pi/agent/extensions/antigravity-native
cd ~/.pi/agent/extensions/antigravity-native

# Cài đặt dependencies và build
npm install
npm run build

# Chạy test suite (68 tests)
npm test
```

### 2. Cấu hình `~/.pi/agent/settings.json`

```jsonc
{
  "defaultModel": "google-antigravity/gemini-3.7-flash",
  "smallModel": "google-antigravity/gemini-3.6-flash",
  "plugins": ["antigravity-native"]
}
```

*(Bạn có thể sử dụng prefix `antigravity/` hoặc `google-antigravity/` đều được)*

### 3. Đăng nhập & Bắt đầu sử dụng

```bash
# Đăng nhập OAuth 2.0 PKCE với tài khoản Google
pi login google-antigravity
# hoặc:
pi login antigravity

# Khởi động Pi CLI
pi

# Chỉ định model cụ thể và mức thinking
pi --model google-antigravity/gemini-3.7-flash --thinking high "Phân tích kiến trúc dự án này"

# Xem danh sách models đã đăng ký
pi --list-models | grep antigravity
```

---

## 🧪 Kiểm Thử & Đóng Gói (Development & Testing)

```bash
# Chạy bộ test suite 68 tests tự động
npm test

# Kiểm tra kiểu TypeScript (Type check)
npm run typecheck

# Build lại dist/
npm run build
```

---

## 📜 Giấy Phép (License)

Dự án được phân phối dưới giấy phép [MIT License](LICENSE). Bản quyền thuộc về **Minh GV** (`minhgv@gmail.com`).
