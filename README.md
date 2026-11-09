# StudyFlow – Smart Study Planner

Nền tảng quản lý kế hoạch học tập, nhiệm vụ và tiến độ học tập dành cho học sinh, sinh viên và giáo viên.

**Công nghệ:** Next.js 14 (App Router) • TypeScript • Tailwind CSS • Lucide React Icons • Recharts • Supabase (Auth + PostgreSQL) • RLS bảo mật theo người dùng.

---

## ✨ Các chức năng

| Module | Chức năng chính |
| --- | --- |
| **Dashboard** | Thống kê nhiệm vụ hôm nay (tổng / đã xong / còn lại), tổng thời gian học tuần, % mục tiêu tuần, lịch học hôm nay, deadline 7 ngày tới, biểu đồ thời gian học 7 ngày |
| **Task Manager** | Thêm / sửa / xóa nhiệm vụ, mô tả, môn học, ngày bắt đầu + deadline, ưu tiên (Thấp/TB/Cao), trạng thái (Chưa bắt đầu / Đang thực hiện / Hoàn thành), đánh dấu hoàn thành, tìm kiếm + 3 bộ lọc |
| **Calendar** | Chế độ Ngày / Tuần / Tháng, bấm vào ngày để tạo nhiệm vụ ngay, chỉnh sửa trực tiếp từ ô lịch, màu theo môn học, màu đỏ cho quá hạn |
| **Subject Manager** | Thêm / sửa / xóa môn học, 10 màu đại diện, mục tiêu riêng từng môn, số nhiệm vụ + tiến độ + phút đã học theo môn |
| **Pomodoro** | Đồng hồ 25/5 phút mặc định, nghỉ dài 15 phút sau n phiên, tùy chỉnh thời lượng, vòng tròn tiến độ, tự động ghi nhận thời gian học thực tế, thống kê hôm nay / 7 ngày / tổng |
| **Statistics** | Tổng thời gian học theo 7/30 ngày & tháng, số + tỷ lệ nhiệm vụ hoàn thành, môn chiếm nhiều thời gian nhất, biểu đồ ngày/tuần, so sánh tuần này vs tuần trước |
| **Goals** | Mục tiêu hằng ngày / hằng tuần theo số nhiệm vụ hoặc số phút, thanh tiến độ trực tiếp, thông báo chúc mừng khi đạt |
| **Tài khoản** | Đăng ký / đăng nhập / đăng xuất, dữ liệu tách biệt theo người dùng |
| **Giao diện** | Dark Mode / Light Mode, responsive DTB/máy tính, toast thông báo mọi thao tác, trạng thái loading, validate dữ liệu đầu vào |

---

## 🚀 Chạy dự án

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # build production
npm run typecheck # kiểm tra TypeScript
```

### Chế độ lưu trữ cục bộ (mặc định)

Chưa cần cấu hình gì thêm. Ứng dụng dùng storage bền vững theo từng tài khoản cục bộ:

- Đăng ký / đăng nhập / đăng xuất hoạt động thật (tài khoản lưu trong dữ liệu trình duyệt).
- Dữ liệu **không mất** khi tải lại trang; mỗi tài khoản chỉ thấy dữ liệu của mình.
- Badge "Lưu cục bộ" hiển thị ở thanh trên cùng.

> Chế độ này phù hợp để dùng thử / demo. Khi triển khai thật, hãy cấu hình Supabase.

### Bật Supabase (đăng nhập + database trên server)

1. Tạo project tại [supabase.com](https://supabase.com).
2. Vào **SQL Editor**, chạy đầy đủ nội dung file [`supabase/schema.sql`](./supabase/schema.sql) rồi Run — tạo 4 bảng (`subjects`, `tasks`, `sessions`, `goals`), bật **Row Level Security** với chính sách `auth.uid() = user_id` (mỗi user chỉ đọc/ghi dữ liệu của mình).
3. Copy project settings → **API** → copy `URL` và `anon key`.
4. Tạo file `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon/public key)
```

5. Khởi động lại `npm run dev` — badge trên thanh chuyển thành **Supabase**, đăng ký/đăng nhập chạy qua Supabase Auth, dữ liệu nằm trên PostgreSQL.

---

## 🗂 Cấu trúc thư mục

```
src/
├─ app/
│  ├─ (auth)/login, (auth)/register   # Trang đăng nhập / đăng ký
│  ├─ (app)/dashboard|tasks|calendar  # Các trang trong shell sidebar
│  │        |subjects|focus|statistics|goals
│  ├─ layout.tsx                      # Providers: Theme → Toast → Auth → Data
│  └─ globals.css                     # Tailwind + CSS variables Light/Dark
├─ components/
│  ├─ ui.tsx                          # Button, TextField, Modal, Card, Toast...
│  ├─ app-shell.tsx                   # Sidebar + Topbar + guard đăng nhập
│  ├─ task-modal.tsx / goal-modal.tsx # Form CRUD có validate
│  └─ charts.tsx                      # Wrapper Recharts (Bar/Line/Pie)
└─ lib/
   ├─ types.ts                        # Kiểu dữ liệu domain
   ├─ date.ts / stats.ts              # Helper ngày tháng + hàm tính thuần
   ├─ supabase.ts                     # Client Supabase (chỉ khi cấu hình)
   ├─ adapter.ts                      # Tầng lưu trữ: supabaseAdapter | localAdapter
   └─ auth.tsx / data.tsx / toast.tsx # Auth, nguồn dữ liệu, thông báo
supabase/schema.sql                   # Schema + RLS cho PostgreSQL
```

## 🔒 Bảo mật dữ liệu

- **Supabase mode:** Row Level Security theo `auth.uid()` — sự tách biệt giữa các tài khoản được thực thi ngay ở cấp database.
- **Local mode:** dữ liệu lưu theo `user_id` riêng cho từng tài khoản trên máy.
- Không gọi trực tiếp service_role; chỉ dùng anon key phía client.

## 📄 License

Mặc định MIT — bạn có thể tùy chỉnh theo nhu cầu.
