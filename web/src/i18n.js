// 介面文字字典與翻譯函式。
// SETTINGS_TEXT：鍵名式（歷史用法，三頁表格等）；UI_TEXT：中文原文為鍵（框架文字）。
// zh-TW 不需要 UI_TEXT 條目——查不到時 fallback 就是原文。
export const I18N = { lang: "zh-TW" };

export const SETTINGS_TEXT = {
  "zh-TW": { settings: "設定", today: "今天", orders: "工單", people: "人", output: "產量", notes: "備忘", more: "更多", worklog: "工作紀錄", shortage: "欠缺品項", transfer: "給二廠／回一廠", addrow: "＋加一列", work: "上班", leave: "休假", uncertain: "未確定", backToday: "← 回今天班表", floor: "廠區平面圖", floorHint: "藍＝當日有排程、灰＝閒置、紅＝故障。沒有佈局資料時自動按工序排列。", saved: "已儲存", notSaved: "沒存到", close: "關閉", cancel: "取消", save: "儲存", delete: "刪除" },
  en: { settings: "Settings", today: "Today", orders: "Orders", people: "People", output: "Output", notes: "Notes", more: "More", worklog: "Work Log", shortage: "Shortage", transfer: "Send/Return", addrow: "＋Add Row", work: "Work", leave: "Leave", uncertain: "Uncertain", backToday: "← Back to Today", floor: "Floor Plan", floorHint: "Blue=scheduled today, Gray=idle, Red=fault. Auto-arranged by process when no layout data.", saved: "Saved", notSaved: "Not saved", close: "Close", cancel: "Cancel", save: "Save", delete: "Delete" },
  vi: { settings: "Cài đặt", today: "Hôm nay", orders: "Đơn hàng", people: "Người", output: "Sản lượng", notes: "Ghi chú", more: "Thêm", worklog: "Nhật ký", shortage: "Thiếu hàng", transfer: "Giao/Nhận", addrow: "＋Thêm dòng", work: "Đi làm", leave: "Nghỉ", uncertain: "Chưa chắc", backToday: "← Về hôm nay", floor: "Sơ đồ nhà xưởng", floorHint: "Xanh=có lịch hôm nay, Xám=rảnh, Đỏ=lỗi. Tự xếp theo công đoạn khi chưa có dữ liệu bố trí.", saved: "Đã lưu", notSaved: "Không lưu được", close: "Đóng", cancel: "Hủy", save: "Lưu", delete: "Xóa" },
  th: { settings: "ตั้งค่า", today: "วันนี้", orders: "ใบสั่งงาน", people: "คน", output: "ผลผลิต", notes: "บันทึก", more: "เพิ่มเติม", worklog: "บันทึกงาน", shortage: "ของขาด", transfer: "ส่ง/รับคืน", addrow: "＋เพิ่มแถว", work: "ทำงาน", leave: "ลา", uncertain: "ไม่แน่ใจ", backToday: "← กลับวันนี้", floor: "ผังโรงงาน", floorHint: "น้ำเงิน=มีงานวันนี้ เทา=ว่าง แดง=เสีย จัดเรียงอัตโนมัติเมื่อยังไม่มีข้อมูลตำแหน่ง", saved: "บันทึกแล้ว", notSaved: "บันทึกไม่ได้", close: "ปิด", cancel: "ยกเลิก", save: "บันทึก", delete: "ลบ" },
};

export const UI_TEXT = {
  "今天排程": { en: "Schedule", vi: "Lịch sản xuất", th: "ตารางผลิต" },
  "機台 × 時間": { en: "Machines × time", vi: "Máy × thời gian", th: "เครื่อง × เวลา" },
  "跨廠": { en: "All plants", vi: "Cả hai xưởng", th: "ทั้งสองโรง" },
  "未排工作": { en: "Unscheduled", vi: "Chưa xếp lịch", th: "งานที่ยังไม่ได้จัด" },
  "現場回報": { en: "Field report", vi: "Báo cáo hiện trường", th: "รายงานหน้างาน" },
  "當日負荷": { en: "Daily load", vi: "Tải trong ngày", th: "ภาระงานรายวัน" },
  "輪班表": { en: "Shifts", vi: "Bảng ca", th: "ตารางกะ" },
  "工作內容": { en: "Work types", vi: "Nội dung công việc", th: "ประเภทงาน" },
  "跨廠加工": { en: "Cross-plant", vi: "Gia công liên xưởng", th: "ส่งงานข้ามโรง" },
  "欠缺品項": { en: "Shortage", vi: "Thiếu hàng", th: "ของขาด" },
  "員工分組": { en: "Groups", vi: "Nhóm nhân viên", th: "กลุ่มพนักงาน" },
  "權限管理": { en: "Permissions", vi: "Quyền hạn", th: "สิทธิ์การใช้งาน" },
  "試排情境": { en: "Scenarios", vi: "Kịch bản", th: "สถานการณ์จำลอง" },
  "⚙ 設定": { en: "⚙ Settings", vi: "⚙ Cài đặt", th: "⚙ ตั้งค่า" },
  "員工、設備與工單": { en: "Staff, machines & orders", vi: "Nhân viên, máy móc & đơn hàng", th: "พนักงาน เครื่องจักร และใบสั่งงาน" },
  "歷史班表": { en: "History", vi: "Lịch cũ", th: "ตารางเก่า" },
  "匯出／匯入 Excel": { en: "Excel import/export", vi: "Xuất/nhập Excel", th: "นำเข้า/ส่งออก Excel" },
  "全部紀錄": { en: "Change log", vi: "Nhật ký thay đổi", th: "บันทึกการเปลี่ยนแปลง" },
  "操作說明": { en: "Help", vi: "Hướng dẫn", th: "คู่มือ" },
  "意見反饋": { en: "Feedback", vi: "Góp ý", th: "ส่งความคิดเห็น" },
  "產能分析": { en: "Capacity", vi: "Phân tích năng lực", th: "วิเคราะห์กำลังผลิต" },
  "排程比對": { en: "Schedule diff", vi: "So sánh lịch", th: "เปรียบเทียบตาราง" },
  "LINE 通知": { en: "LINE notify", vi: "Thông báo LINE", th: "แจ้งเตือน LINE" },
  "查看反饋": { en: "View feedback", vi: "Xem góp ý", th: "ดูความคิดเห็น" },
  "初次核對資料": { en: "Initial review", vi: "Kiểm tra ban đầu", th: "ตรวจสอบข้อมูลเริ่มต้น" },
  "關閉": { en: "Close", vi: "Đóng", th: "ปิด" },
  "取消": { en: "Cancel", vi: "Hủy", th: "ยกเลิก" },
  "儲存": { en: "Save", vi: "Lưu", th: "บันทึก" },
  "刪除": { en: "Delete", vi: "Xóa", th: "ลบ" },
  "返回": { en: "Back", vi: "Quay lại", th: "ย้อนกลับ" },
  "確定": { en: "OK", vi: "Xác nhận", th: "ตกลง" },
};

export function tx(k) {
  return SETTINGS_TEXT[I18N.lang]?.[k] || UI_TEXT[k]?.[I18N.lang] || SETTINGS_TEXT["zh-TW"][k] || k;
}
