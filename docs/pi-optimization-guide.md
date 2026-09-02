# Cẩm Nang Thực Chiến Tối Ưu Hóa Quy Trình Với Pi Coding Agent

Tài liệu này tổng hợp toàn bộ các phương pháp, nguyên tắc kiến trúc và kỹ thuật thực chiến tối ưu nhất khi làm việc với **Pi Coding Agent**, dựa trên tài liệu kỹ thuật và mã nguồn chính thức của hệ thống.

---

## Mục Lục

1. [Quản Lý Ngữ Cảnh & Tiết Kiệm Token (Context & Token Hygiene)](#1-quản-lý-ngữ-cảnh--tiết-kiệm-token-context--token-hygiene)
   - [1.1. Cơ chế Compaction (Nén ngữ cảnh)](#11-cơ-chế-compaction-nén-ngữ-cảnh)
   - [1.2. Phân nhánh Session với `/tree`, `/fork`, `/clone`](#12-phân-nhánh-session-với-tree-fork-clone)
   - [1.3. Lệnh Shell Ẩn & Giảm Tải Context (`!!command`)](#13-lệnh-shell-ẩn--giảm-tải-context-command)
2. [Bảng Phím Tắt & TUI Tăng Tốc Độ Làm Việc](#2-bảng-phím-tắt--tui-tăng-tốc-độ-làm-việc)
   - [2.1. Phím tắt cốt lõi](#21-phím-tắt-cốt-lõi)
   - [2.2. Chế độ Hàng đợi (Queue) & Can thiệp (Steering)](#22-chế-độ-hàng-đợi-queue--can-thiệp-steering)
   - [2.3. TUI Toàn màn hình & Tìm kiếm](#23-tui-toàn-màn-hình--tìm-kiếm)
3. [Kiến Trúc Mở Rộng: Subagents, Skills, Prompts & Extensions](#3-kiến-trúc-mở-rộng-subagents-skills-prompts--extensions)
   - [3.1. Subagent Delegation (Mô hình Trinh sát - Thi công)](#31-subagent-delegation-mô-hình-trinh-sát---thi-công)
   - [3.2. Agent Skills (Progressive Disclosure)](#32-agent-skills-progressive-disclosure)
   - [3.3. Prompt Templates](#33-prompt-templates)
   - [3.4. TypeScript Extensions](#34-typescript-extensions)
4. [Cấu Hình Chuẩn & Quy Trình 4 Bước SOP](#4-cấu-hình-chuẩn--quy-trình-4-bước-sop)
   - [4.1. File cấu hình tối ưu mẫu (`settings.json`)](#41-file-cấu-hình-tối-ưu-mẫu-settingsjson)
   - [4.2. Quy trình 4 bước Zero-Context-Waste](#42-quy-trình-4-bước-zero-context-waste)
   - [4.3. Bảng tra cứu nhanh lệnh Slash (`/`)](#43-bảng-tra-cứu-nhanh-lệnh-slash-)

---

## 1. Quản Lý Ngữ Cảnh & Tiết Kiệm Token (Context & Token Hygiene)

Pi được thiết kế theo triết lý bảo toàn context window thông qua **Compaction chủ động**, **Cây phân nhánh (Tree Branching)**, và **Cô lập ngữ cảnh (Context Isolation)**.

```
                        ┌────────────────────────────────────────┐
                        │   CONTEXT WINDOW (vd: 128k / 200k)     │
                        └────────────────────────────────────────┘
                                            │
           ┌────────────────────────────────┼────────────────────────────────┐
           ▼                                ▼                                ▼
  [ Auto/Manual Compaction ]       [ Tree Branching (/tree) ]     [ Context Isolation ]
  • reserveTokens: 16k             • Branch Summarization         • !!cmd (Hidden bash)
  • keepRecentTokens: 20k          • Fork / Clone session         • Subagents (Isolated subprocess)
  • Truncate tool output: 2k chars • Shift+L Bookmark labels      • Progressive Skill loading
```

### 1.1. Cơ chế Compaction (Nén ngữ cảnh)
- **Điều kiện kích hoạt tự động:** Khi `contextTokens > contextWindow - reserveTokens` (mặc định dự trữ `16,384` tokens cho câu trả lời của LLM).
- **Nguyên lý cắt (Cut Point):** Pi quét ngược từ tin nhắn mới nhất đến khi đạt ngưỡng `keepRecentTokens` (mặc định `20,000` tokens gần nhất được giữ nguyên).
  - Không bao giờ cắt giữa chừng Tool Call và Tool Result.
  - Tự động cắt ngắn kết quả của tool (`read`, `bash`) xuống **2,000 ký tự** khi nén.
  - Lưu trữ danh sách file đã đọc (`<read-files>`) và đã sửa (`<modified-files>`) qua nhiều lần nén liên tiếp.
- **Thực chiến với `/compact [chỉ dẫn]`:**
  - Chủ động gõ `/compact` khi hoàn thành một giai đoạn công việc (ví dụ: xong khảo sát chuyển sang viết code).
  - *Ví dụ:*
    ```bash
    /compact Chỉ giữ lại cấu trúc kiến trúc và các type contracts đã thống nhất, loại bỏ toàn bộ log debug cũ.
    ```

### 1.2. Phân nhánh Session với `/tree`, `/fork`, `/clone`
Pi lưu trữ toàn bộ phiên làm việc dưới dạng cây JSONL (`id`/`parentId`), cho phép quay lại bất kỳ thời điểm nào:

| Lệnh | Lưu trữ | Ứng dụng thực tế |
| :--- | :--- | :--- |
| **`/tree`** | Cùng file session | Điều hướng toàn bộ cây hội thoại, thử nghiệm nhiều giải pháp rẽ nhánh. |
| **`/fork`** | File session mới | Bắt đầu từ 1 prompt cũ mà không làm thay đổi session hiện tại. |
| **`/clone`** | File session mới | Sao chép toàn bộ nhánh active để tạo backup trước khi refactor lớn. |

- **Branch Summarization (Tóm tắt khi đổi nhánh):**
  - Khi dùng `/tree` chuyển sang nhánh khác, Pi tự động tóm tắt nhánh vừa rời đi thành block: `Goal`, `Progress`, `Key Decisions`, `Next Steps`, `Files`.
  - *Lợi ích:* Kế thừa toàn bộ bài học từ nhánh cũ mà không bị ngập tràn token của log cũ.

### 1.3. Lệnh Shell Ẩn & Giảm Tải Context (`!!command`)
- **`!!command`:** Chạy lệnh terminal nội bộ **không đưa output vào context LLM** (thích hợp cho `!!npm test`, `!!pytest`, `!!git status`).
- **`!command`:** Chạy lệnh và đính kèm trực tiếp output vào prompt của LLM.
- **Fuzzy File `@filename`:** Gõ `@` để chọn nhanh file thông qua menu gợi ý thay vì dán toàn bộ nội dung file vào chat.

---

## 2. Bảng Phím Tắt & TUI Tăng Tốc Độ Làm Việc

### 2.1. Phím tắt cốt lõi

| Phím tắt | Chức năng thực chiến |
| :--- | :--- |
| **`Ctrl + O`** | **Mở rộng / Thu gọn chi tiết Tool call** (xem toàn bộ prompt gửi cho subagent và chi tiết các tool con). |
| **`Shift + Tab`** | Chuyển nhanh cấp độ suy nghĩ: `off` $\rightarrow$ `minimal` $\rightarrow$ `low` $\rightarrow$ `medium` $\rightarrow$ `high` $\rightarrow$ `xhigh` $\rightarrow$ `max`. |
| **`Ctrl + L`** | Mở bảng chọn và chuyển đổi Model trực tiếp. |
| **`Ctrl + P`** | Chuyển nhanh qua lại giữa các model đã khai báo trong `/scoped-models`. |
| **`Ctrl + T`** | Đóng/mở khối suy nghĩ (Thinking Block) trên màn hình. |
| **`Ctrl + X`** | Copy nhanh câu trả lời cuối cùng của Assistant (hoặc node trong `/tree`) vào Clipboard. |
| **`Ctrl + G`** | Mở prompt hiện tại bằng External Editor (`code --wait`, `nvim`, `nano`). |
| **`Escape`** | Ngắt/hủy ngay lập tức lượt phản hồi hoặc lệnh tool đang chạy. |
| **`/reload`** | Nạp lại Keybindings, Extensions, Skills, Prompts ngay lập tức mà **không cần khởi động lại Pi**. |

### 2.2. Chế độ Hàng đợi (Queue) & Can thiệp (Steering)
- **`Enter` (khi agent đang chạy):** *Steering message* — Can thiệp chỉ đạo agent ngay sau khi tool call hiện tại kết thúc.
- **`Alt + Enter`:** *Follow-up message* — Đưa tin nhắn vào hàng đợi, tự động gửi tiếp sau khi agent hoàn tất toàn bộ task hiện tại.
- **`Alt + Up`:** Lấy lại tin nhắn đang nằm trong hàng đợi về ô soạn thảo để chỉnh sửa hoặc hủy.

### 2.3. TUI Toàn màn hình & Tìm kiếm
- Cấu hình `"tuiMode": "fullscreen"` trong `settings.json`:
  - `Ctrl + Shift + F`: Tìm kiếm từ khóa trực tiếp trong transcript.
  - `Ctrl + Shift + Up` / `Ctrl + Shift + Down`: Nhảy nhanh giữa các lượt prompt.

---

## 3. Kiến Trúc Mở Rộng: Subagents, Skills, Prompts & Extensions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HỆ SINH THÁI MỞ RỘNG CỦA PI                       │
├──────────────────┬─────────────────┬───────────────────┬────────────────────┤
│ Prompt Templates │     Skills      │    Extensions     │     Subagents      │
├──────────────────┼─────────────────┼───────────────────┼────────────────────┤
│ Đoạn prompt mẫu  │ Gói kỹ năng     │ Module TypeScript │ Cô lập Context con │
│ có tham số       │ chuyên sâu      │ can thiệp vòng đời│ chạy song song     │
│ $1, $@, ${1:-df} │ nạp on-demand   │ & thêm Tool/UI    │ độc lập            │
└──────────────────┴─────────────────┴───────────────────┴────────────────────┘
```

### 3.1. Subagent Delegation (Mô hình Trinh sát - Thi công)
Subagent giúp giải quyết triệt để vấn đề tràn context bằng cách chạy các tiến trình con độc lập:
- **`scout` (Model nhanh, tiết kiệm):** Chỉ cấp công cụ `read`, `grep`, `find` và SOT-Graph. Chuyên khảo sát codebase và trả về toạ độ dòng code (`file:line`).
- **`Main Agent / Builder` (Model mạnh):** Giữ context sạch sẽ để lập trình, ra quyết định và chỉnh sửa file.

### 3.2. Agent Skills (Progressive Disclosure)
- Khởi động chỉ nạp `name` và `description` (~50 tokens).
- Chỉ khi bài toán khớp với mô tả, Agent mới tự động đọc nội dung file `SKILL.md` và tài liệu trong thư mục `references/`.
- Cấu trúc chuẩn:
  ```text
  my-skill/
  ├── SKILL.md              # Frontmatter + hướng dẫn tổng quan
  ├── scripts/              # Chứa script thực thi (.sh, .js, .py)
  └── references/           # Tài liệu tra cứu chi tiết (chỉ đọc khi cần)
  ```

### 3.3. Prompt Templates (`~/.pi/agent/prompts/`)
Chuẩn hóa các câu lệnh lặp đi lặp lại với tham số:
```markdown
---
description: Review pull request hoặc staged diff
argument-hint: "[branch-or-commit]"
---
Hãy kiểm tra các thay đổi trong `${1:-HEAD}`. Tập trung phân tích:
1. Lỗ hổng bảo mật và xử lý ngoại lệ.
2. Hiệu năng & Rò rỉ bộ nhớ (Memory leak).
3. Đề xuất code refactor ngắn gọn.
```

### 3.4. TypeScript Extensions (`~/.pi/agent/extensions/`)
Mở rộng sức mạnh Pi bằng TypeScript thuần (nạp qua `jiti` không cần compile trước):
- Đăng ký công cụ tùy biến (`pi.registerTool`).
- Thiết lập Security Gate chặn lệnh nguy hiểm trước khi thực thi (`tool_call` hook).
- Tùy biến thanh trạng thái và giao diện TUI (`ctx.ui.setStatus`).

---

## 4. Cấu Hình Chuẩn & Quy Trình 4 Bước SOP

### 4.1. File cấu hình tối ưu mẫu (`~/.pi/agent/settings.json`)

```json
{
  "defaultModel": "google-antigravity/gemini-3.7-flash-high",
  "smallModel": "google-antigravity/gemini-3.7-flash-low",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "branchSummary": {
    "reserveTokens": 16384,
    "skipPrompt": false
  },
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "tuiMode": "fullscreen",
  "externalEditor": "code --wait",
  "defaultProjectTrust": "ask"
}
```

### 4.2. Quy trình Chuẩn: Intent - Advisor - 4-Pillar Plan & TDD Review SOP

Để ngăn ngừa sai lệch kiến trúc, sót edge case và đảm bảo code đúng 100% ngay từ lần đầu:

```
[ 1. INTENT DRAFT ] ────► [ 2. ADVISOR CRITIQUE ] ────► [ 3. 4-PILLAR PLAN ] ────► [ 4. TDD & REVIEW ]
• Main: Ý định sơ bộ      • Advisor phản biện rủi ro    • Main: Hoàn thiện Plan       • Viết Test ĐỎ trước
• SOT-Graph / Scout       • Tự gọi Scout xác minh       • Đủ 4 trụ cột chuẩn          • Implement -> Review diff
```

#### Bước 1: Lập Ý Định (Intent Draft) & Nắm Bức Tranh Toàn Cảnh
- **Ưu tiên SOT-Graph:** Main Agent dùng `sot_map`, `sot_search`, `sot_explore` để nắm nhanh cấu trúc toàn cảnh và mối quan hệ giữa các module.
- **Phạm vi khảo sát:**
  - Nếu số lượng file ít hoặc tra cứu nhanh: Main Agent tự khảo sát qua SOT tools và đọc range ngắn.
  - Nếu phạm vi rộng, phức tạp: Bắt buộc giao cho `scout` subagent để trinh sát và trả về toạ độ dòng code (`file:line`).
- **Ý định ban đầu (Intent Draft):** Main Agent tổng hợp mục tiêu, phương án sơ bộ, giả định kỹ thuật và các điểm cần làm rõ.

#### Bước 2: Advisor Phản Biện & Khuyến Nghị (Advisor Critique)
- Main Agent chuyển *Intent Draft* cho `advisor` subagent (`Agent(subagent_type: "advisor")`).
- **Advisor (Pure Reasoning Mode):**
  - Mổ xẻ các rủi ro kiến trúc, race condition, lỗ hổng bảo mật, tính tương thích ngược và side-effects.
  - Tự động gọi `scout` nếu cần xác minh các fact cụ thể trong codebase.
  - Trả về bản khuyến nghị chiến lược và các điều chỉnh cần thiết.

#### Bước 3: Hoàn Thiện Plan 4 Trụ Cột & Viết Test TDD (4-Pillar Plan & TDD First)
- Main Agent tiếp thu khuyến nghị từ Advisor và công bố **Bản Plan chính thức** với 4 trụ cột bắt buộc:
  1. **Blast Radius (Phạm vi tác động):** File, hàm, toạ độ bị ảnh hưởng và nguy cơ tác động chéo (xác định qua SOT).
  2. **Contracts & State Machine:** Định nghĩa rõ Types, Signatures, Error codes, State transitions (`A -> B -> C`).
  3. **Ma trận Edge Cases:** Null/Undefined, boundary values, timeouts, race conditions, fail-fast validations.
  4. **TDD Test Matrix:** Danh sách các ca kiểm thử cụ thể (Happy path + Edge cases + Failure paths).
- **TDD Test-First Execution:**
  - Viết file kiểm thử trước (chứa đầy đủ các assertions trong Test Matrix).
  - Chạy `!!test` để kiểm tra test **FAIL (ĐỎ)** đúng nguyên nhân do chưa có logic.

#### Bước 4: Thực Thi & Đối Chiếu Tam Giác (Implement & Adversarial Review)
- **Implement:** Người thi công (Builder/Main) viết code production nhằm mục tiêu duy nhất: **Đưa toàn bộ test suite chuyển sang PASS (XANH)**.
- **Đối chiếu Tam giác (Triangular Verification):**
  1. **Đối chiếu Git Diff vs Plan:** `git diff` có bám sát Blueprint không? Có sửa thừa vào file ngoài phạm vi không? Có vô tình xóa type guard hay logic quan trọng không?
  2. **Auditing Edge Cases & Security:** Đã bọc `try-catch-finally`, sanitize input, timeout, không leak raw error ra client.
  3. **Độ bao phủ Test:** Xác nhận 100% các ca trong Ma trận Edge Cases đã được kiểm thử thực tế và pass hoàn toàn.
  4. **Dọn dẹp Context:** Gõ `/compact [chỉ dẫn]` để nén gọn ngữ cảnh cho task kế tiếp.

---

### 4.3. Bảng tra cứu nhanh lệnh Slash (`/`)

#### Nhóm Lệnh Quy Trình Kiến Trúc (Architectural Workflow Commands)
| Lệnh | Cú pháp & Argument Hints | Mô tả tác vụ |
| :--- | :--- | :--- |
| **`/intent`** | `/intent <symbol-or-feature> <description...>` | Khởi tạo Ý định & quét SOT-Graph (Giai đoạn 1). |
| **`/critique`** | `/critique <intent-spec-or-symbol...>` | Advisor phản biện kiến trúc, invariants, rủi ro (Giai đoạn 2). |
| **`/plan-4p`** | `/plan-4p <approved-critique-context...>` | Lập Kế hoạch 4 Trụ cột & TDD Matrix (Giai đoạn 3). |
| **`/tdd-run`** | `/tdd-run <test-file-path> [mode=red\|green]` | Chạy chu trình kiểm thử TDD Đỏ-Xanh (Giai đoạn 3.5 & 4). |
| **`/review-diff`** | `/review-diff [base-ref=HEAD~1]` | Thẩm định đối kháng `git diff` vs Plan vs Tests (Giai đoạn 4). |

#### Nhóm Lệnh Hệ Thống & Phiên Làm Việc (System & Session Commands)
| Lệnh | Mô tả tác vụ |
| :--- | :--- |
| **`/resume`** | Quản lý và tiếp tục các phiên làm việc cũ (`Ctrl+R` đổi tên, `Ctrl+D` xóa). |
| **`/tree`** | Bản đồ phân nhánh lịch sử trực quan (`Shift+L` gán nhãn, `Ctrl+O` đổi filter). |
| **`/compact [chỉ dẫn]`** | Nén ngữ cảnh thủ công có định hướng. |
| **`/scoped-models`** | Cấu hình danh sách model chuyển nhanh bằng `Ctrl+P`. |
| **`/settings`** | Xem và tùy chỉnh theme, thinking level, transport. |
| **`/reload`** | Nạp lại cấu hình, skills, prompt templates ngay lập tức. |
| **`/copy`** hoặc **`Ctrl+X`** | Copy nhanh kết quả phản hồi cuối cùng. |
| **`/share`** hoặc **`/export`** | Xuất phiên làm việc ra HTML hoặc private Gist. |
