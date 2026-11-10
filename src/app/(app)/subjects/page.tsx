import { redirect } from "next/navigation";

/**
 * v2: Trang "Môn học" đã được nâng cấp thành trang "Môn học" (/courses)
 * với mã môn, giảng viên, tín chỉ, chương học & mức độ hiểu bài.
 * Đường dẫn cũ /subjects được chuyển hướng để liên kết cũ không gãy.
 */
export default function SubjectsPage() {
  redirect("/courses");
}
