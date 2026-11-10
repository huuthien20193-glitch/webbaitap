# StudyOS 2.0 – AI-Powered Study Platform

Nền tảng học tập thông minh nâng cấp từ StudyFlow: kế hoạch học tập có thuật toán ưu tiên, trợ lý AI (Gemini), ôn tập SM-2, phân tích học tập — dành cho học sinh, sinh viên.

**Công nghệ:** Next.js 14 (App Router) • TypeScript • Tailwind CSS • Lucide Icons • Recharts • Supabase (Auth + PostgreSQL + RLS) • Google Gemini (server-side proxy).

> **Nâng cấp v2 giữ nguyên 100% dữ liệu v1**: Migration `supabase/migrations/002_studyos_v2.sql` không DROP bảng/cột nào — chỉ thêm bảng mới, thêm cột, và copy dữ liệu (id giữ nguyên nên lịch sử không mất). App cục bộ cũng tự migration localStorage bằng cờ một lần (`studyflow:migrated:<user>`).

---

## ✨ Các chức năng (v2.0)

| Module | Chức năng chính |
| --- | --- |
| **Dashboard v2** | Chào mừng cá nhân hoá, chuỗi ngày học liên tục 🔥, 6 KPI (môn, nhiệm vụ, hoàn thành hôm nay, phút tuần, streak, flashcard đến hạn), hàng đợi "Nên ưu tiên bây giờ" (thuật toán), **gợi ý 3 việc tiếp theo từ AI**, mục tiêu tuần %, biểu đồ 7 ngày, tiến độ từng môn, lịch hôm nay + deadline 7 ngày |
| **Smart Planner** | Hàng đợi ưu tiên có **điểm số giải thích** (urgency 45% + importance 22% + difficulty 15% + thời lượng 10% + tiến độ 8%), **xếp lịch tự động** theo băng thông mỗi ngày (xem trước → duyệt & áp dụng), **lập kế hoạch bằng AI** (đề xuất lịch + nhiệm vụ mới tạo nhanh), bảng tuần 7 ngày **kéo-thả** đổi deadline |
| **Course Manager** | Môn học đầy đủ: mã môn, giảng viên, tín chỉ, mô tả, mục tiêu, màu nhận diện. **Chương học** với nội dung + **mức độ hiểu bài 1–5** (click chấm tròn), tiến độ hiểu %, tiến độ nhiệm vụ %, cascading xóa an toàn |
| **AI Assistant** | Chat hỏi đáp qua **Gemini server-side** (key không bao giờ ở frontend), lưu hội thoại theo user, 4 chế độ: Hỏi đáp / Tóm tắt tài liệu / **Trắc nghiệm tương tác 5 câu** (chọn đáp án có giải thích) / **Tạo flashcard** lưu thẳng vào Ôn tập, "Phân tích tiến độ của tôi" đọc toàn bộ dữ liệu học |
| **Smart Revision** | Ôn tập **SM-2** (SuperMemo-2): lật thẻ → đánh giá Quên/Khó/Tốt/Dễ → ease + interval + dueDate tính tự động, hàng đợi theo dueDate, kho thẻ CRUD có tìm kiếm + bộ lọc môn/chương, thống kê đã ôn hôm nay |
| **Focus Mode (Pomodoro)** | **Chống mất tiến độ**: lưu snapshot runtime vào localStorage, tải lại trang/tab giữa chừng → đếm khôi phục theo Δ thời gian thực, **hoàn thành phiên khi vắng mặt vẫn được ghi nhận**, nghỉ ngắn/dài tự động sau n chu kỳ, cài đặt thời lượng, vòng tròn tiến độ, tiêu đề tab chạy theo đồng hồ, danh sách phiên hôm nay |
| **Learning Analytics** | KPI (tổng giờ, số phiên, tỷ lệ hoàn thành, streak, điểm TB kiểm tra), biểu đồ tuần 8 tuần + pie theo môn + line 14 ngày, tiến độ từng môn, **nội dung đang yếu** (chương hiểu ≤2/5), **quản lý bài kiểm tra + nhập kết quả** (điểm 0–100 + ghi chú), **báo cáo học tập tuần bằng AI** |
| **Nhiệm vụ v2** | Thêm/sửa/xóa + trường mới: **thời lượng dự kiến**, **độ khó 1–5**, **độ quan trọng 1–5**, **tiến độ %**, badge "Ưu tiên N" từ thuật toán, sắp xếp **Thông minh (AI) / Deadline / Mới nhất**, tìm kiếm từ header |
| **Calendar** | Ngày / Tuần / Tháng, tạo nhiệm vụ theo ngày bấm, kéo thả ở Planner, màu theo môn, đỏ cho quá hạn |
| **Goals** | Mục tiêu hằng ngày/tuần theo nhiệm vụ hoặc phút, tiến độ trực tiếp, chúc mừng khi đạt |
| **Giao diện** | Tông **Indigo/Violet**, sidebar **thu gọn được**, header tìm kiếm + chuông thông báo (quá hạn/flashcard đến hạn/kỳ thi) + hồ sơ, Dark/Light mode, hiệu ứng fade-up/card-lift/glass, responsive đầy đủ |

---

## 🚀 Chạy dự án

```bash
npm install
npm run dev       # http://localhost:3000 (hoặc PORT tùy chọn)
npm run build     # build production
npm run typecheck # kiểm tra TypeScript
```

### Chế độ lưu trữ cục bộ (mặc định)

Chưa cần cấu hình gì thêm. Ứng dụng dùng storage bền vững theo từng tài khoản cục bộ:

- Đăng ký / đăng nhập / đăng xuất hoạt động thật; dữ liệu **không mất** khi tải lại trang.
- Badge "Lưu cục bộ" hiển thị ở thanh trên cùng.
- Dữ liệu v1 (subjects/subjectId) tự chuyển sang v2 (courses/courseId) bằng cờ migration một lần.

### Bật Supabase (đăng nhập + database trên server)

1. Tạo project tại [supabase.com](https://supabase.com).
2. **SQL Editor**: chạy [`supabase/schema.sql`](./supabase/schema.sql) (v1) rồi [`supabase/migrations/002_studyos_v2.sql`](./supabase/migrations/002_studyos_v2.sql) — tạo `profiles, courses, chapters, tasks(+cột v2), study_sessions, flashcards, reviews, exams, exam_results, ai_conversations` với RLS `auth.uid() = user_id`, và copy dữ liệu cũ an toàn.
3. Copy **API** → `URL` + `anon key` vào `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Bật AI (Gemini) — key chỉ nằm ở server

1. Lấy API key miễn phí tại [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Thêm vào `.env.local` (hoặc biến môi trường của Render):

```bash
GEMINI_API_KEY=AIza...
```

3. Khởi động lại. Frontend chỉ gọi `/api/ai` (rate-limit độ dài đầu vào, guard JSON đầu ra, timeout 50s) — **API key không bao giờ xuất hiện ở bundle trình duyệt**.

---

## 🗂 Cấu trúc thư mục

```
src/
├─ app/
│  ├─ (auth)/login, (auth)/register            # Trang đăng nhập / đăng ký
│  ├─ (app)/dashboard|planner|tasks|calendar   # Shell sidebar (thu gọn được)
│  │        |courses|assistant|revision|focus
│  │        |analytics|statistics|goals
│  ├─ api/ai/route.ts                          # Proxy Gemini server-side (key ẩn)
│  ├─ api/health/route.ts                      # Health check cho Render
│  ├─ layout.tsx                               # Providers: Theme → Toast → Auth → Data
│  └─ globals.css                              # Tailwind + CSS variables Light/Dark
├─ components/
│  ├─ ui.tsx / charts.tsx                      # Button/Modal/Chart (tông indigo)
│  ├─ app-shell.tsx                            # Sidebar thu gọn + search/notif/profile
│  └─ task-modal.tsx / goal-modal.tsx          # Form CRUD có validate
└─ lib/
   ├─ types.ts / sm2.ts / planner.ts / stats.ts# Domain + thuật toán v2
   ├─ adapter.ts                               # 10 entities: Supabase | Local + migration
   ├─ data.tsx / auth.tsx / toast.tsx          # Nguồn dữ liệu, auth, thông báo
   └─ ai.ts                                    # Client gọi /api/ai an toàn
supabase/
├─ schema.sql                                  # Schema v1 (4 bảng)
└─ migrations/002_studyos_v2.sql               # Migration an toàn 10 bảng v2
render.yaml                                    # Cấu hình deploy Render (free)
```

## 🔒 Bảo mật dữ liệu

- **Supabase mode:** Row Level Security theo `auth.uid()` ở cấp database.
- **Local mode:** dữ liệu theo `user_id` riêng từng tài khoản trên máy.
- **AI:** API key Gemini chỉ đọc tại server; request đi qua `/api/ai` với giới hạn độ dài + guard JSON.
- Không dùng service_role phía client.

## 📄 License

MIT.
