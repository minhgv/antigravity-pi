# Pi Antigravity Native Extension (`pi-antigravity-native`)

Extension tích hợp **Google Antigravity 2.0 Native Provider** dành cho **Pi CLI** (`@mariozechner/pi-coding-agent` / `@earendil-works/pi-coding-agent`).

> **Cross-platform (macOS + Linux):**
> - **Vendor self-contained**: Chạy độc lập trên mọi nền tảng mà không cần vá (patch) `node_modules`.
> - **Fallback patch toàn cục**: Tuỳ chọn chèn provider vào `dist/` pi-ai global với đầy đủ các bản vá tương thích (`supportsXhigh`, `createFauxCore`, `api-registry`...).

Provider `google-antigravity` kết nối trực tiếp **Cloud Code Assist API** của Google (`*.cloudcode-pa.googleapis.com`) qua OAuth 2.0 PKCE. Cơ chế native tool calling chạy mượt mà trên động cơ `pi-ai`, hỗ trợ trọn vẹn toàn bộ công cụ cốt lõi (`read`, `write`, `edit`, `bash`) và subagents.

---

## 🚀 Tính năng nổi bật

- ⚡ **Native Tool Calling & Subagent Delegation**: Hỗ trợ đầy đủ bộ công cụ chuẩn và tương thích hoàn hảo với hệ thống subagents (`advisor`, `scout`, `Explore`, `Plan`).
- 🔑 **OAuth 2.0 PKCE**: Đăng nhập nhanh chóng và an toàn qua `pi login google-antigravity`.
- ♻️ **401 Force-Refresh & Single-Flight Token Rotation**: Tự động phát hiện và làm mới token khi bị từ chối giữa phiên, lưu ngược an toàn vào `~/.pi/agent/auth.json` (chmod `0600`) mà không làm gián đoạn tác vụ đang chạy.
- 📦 **Catalog 16 Mô hình Gemini Core Active**: Đồng bộ chuẩn với danh mục active của Antigravity (`ANTIGRAVITY_MODEL_CATALOG`), tối ưu cho coding agent.
- 🧠 **Cơ chế Reasoning Level Thông minh**: Tự động giải quyết thinking effort theo hậu tố (`-high`, `-medium`, `-low`), tự động kẹp (clamp) mức sàn an toàn `LOW` trên Gemini 3.7+ để loại bỏ lỗi backend `HTTP 400 (MINIMAL not supported)`.
- 🛡️ **User-Agent 3 chế độ (`PI_ANTIGRAVITY_UA_MODE`)**: `cli` (mặc định — mở khóa toàn bộ model mới), `sdk`, và `desktop`, tự động nhận diện OS và kiến trúc CPU.
- 📦 **Self-contained Vendor**: Snapshot khép kín, hoạt động ngay sau khi clone mà không bắt buộc can thiệp vào mã nguồn Pi.
- 🧪 **Bộ Test Suite Toàn diện**: Đi kèm bộ kiểm thử tự động 23 verification tests cho toàn bộ danh mục model và logic giải quyết thinking level.

---

## 📋 Danh sách Models khả dụng (Available Models)

Provider `google-antigravity` cung cấp danh mục 16 mô hình Gemini core active tối ưu cho lập trình:

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

## 🔧 Cách hoạt động & 8 Cơ chế Tương thích

Extension load theo thứ tự ưu tiên:
1. **Vendor local (chính):** `import file://vendor/providers/google-gemini-cli.js` + `vendor/utils/oauth/google-antigravity.js`.
2. **Fallback pi-ai global:** Quét candidate paths (macOS + Linux + `require.resolve`).

### 8 Cơ chế Tương thích Giao thức:
1. **System Instruction Wrapper (`role: "user"` & `parts`):** Đóng gói System Instruction dưới cấu trúc `parts` chứa tiền tố nhận diện DeepMind Antigravity Agent kèm thẻ `[ignore]`.
2. **Payload `requestType: "agent"`:** Thêm thuộc tính `"requestType": "agent"` ở cấp cao nhất của body JSON request.
3. **Payload `userAgent: "antigravity"`:** Gắn `"userAgent": "antigravity"` trong payload JSON gửi tới CloudCode Assist API.
4. **Custom `requestId: "agent-..."`:** Tự sinh `requestId` theo cấu trúc `agent-${Date.now()}-${random}` tương thích với log trace của Antigravity Server.
5. **HTTP User-Agent Header (3 chế độ):** Truyền Header `User-Agent` theo chế độ đặt qua `PI_ANTIGRAVITY_UA_MODE`: `cli` (mặc định), `sdk`, và `desktop`.
6. **Endpoint Sandbox Cascade Fallback:** Định tuyến ưu tiên qua 3 cấp endpoint Sandbox của Google CloudCode (`daily-cloudcode-pa.sandbox.googleapis.com` $\rightarrow$ `autopush` $\rightarrow$ `prod`).
7. **Claude Thinking Beta Header:** Tự động chèn `anthropic-beta: interleaved-thinking-2025-05-14` khi cần.
8. **Multi-Scope OAuth PKCE & Auto Rotation:** Đăng nhập qua PKCE cổng `51121` với đầy đủ các scope mở rộng, hỗ trợ Project ID fallback và tự động xoay vòng token khi gặp lỗi 401 giữa phiên.

---

## 📂 Cấu trúc Dự án

```text
pi-antigravity-native/
├── index.ts                       # Extension entry: đăng ký 16 core models & provider
├── package.json
├── AGENTS.md                      # Quy tắc dự án & Advisor consultation protocol
├── tests/
│   └── test-models.js             # Bộ 23 verification tests cho model & thinking level
├── scripts/
│   ├── patch-global.js            # (Tuỳ chọn) Patch pi-ai dist toàn cục
│   └── sync-vendor-deps.js        # Re-sync vendor khi nâng cấp Pi
├── vendor/                        # Snapshot self-contained (xem vendor/NOTICE.md)
│   ├── NOTICE.md
│   ├── providers/                 # google-gemini-cli, google-shared, simple-options...
│   ├── utils/                     # oauth/*, event-stream, headers...
│   └── api/ auth/ models.js
└── README.md
```

---

## 🛠️ Cài đặt & Sử dụng

### 1. Cài đặt Extension

```bash
# Clone vào thư mục extensions của Pi
mkdir -p ~/.pi/agent/extensions
git clone https://github.com/minhgv/pi-antigravity-native.git ~/.pi/agent/extensions/antigravity-native
cd ~/.pi/agent/extensions/antigravity-native

# Cài đặt dependencies
npm install

# Chạy test kiểm tra toàn bộ 16 models & logic thinking
npm run test:models
```

### 2. Cấu hình `~/.pi/agent/settings.json`

```jsonc
{
  "defaultModel": "google-antigravity/gemini-pro-agent",
  "smallModel": "google-antigravity/gemini-3-flash",
  "plugins": ["antigravity-native"]
}
```

### 3. Đăng nhập & Sử dụng CLI

```bash
# Đăng nhập OAuth PKCE lần đầu
pi login google-antigravity

# Khởi động với model mặc định (Gemini 3.1 Pro High)
pi

# Khởi động với model cụ thể
pi --model google-antigravity/gemini-3.7-flash-high "Xin chào!"

# Liệt kê danh sách models khả dụng
pi --list-models | grep google-antigravity
```

---

## 🧪 Chạy Kiểm thử (Testing)

```bash
# Kiểm tra extension load thành công với Pi CLI
npm test

# Chạy bộ test suite 23 tests kiểm tra toàn diện 16 models và logic thinking
npm run test:models
```

---

## 📜 Giấy phép

MIT License. `vendor/` bundle file nội bộ của `@earendil-works/pi-ai` (cũng MIT) — xem `vendor/NOTICE.md` để biết thêm chi tiết.
