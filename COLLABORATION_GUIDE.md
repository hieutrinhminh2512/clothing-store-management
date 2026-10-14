# Hướng Dẫn Quy Trình Làm Việc & Phân Quyền Code Nhóm (Git Workflow)

Tài liệu này hướng dẫn cách tổ chức 2 nhánh (`main` và `dev`), cách thêm bạn/nhân viên vào code cùng và quy trình duyệt code (Code Review / Pull Request).

---

## 🌳 1. Cấu Trúc 2 Nhánh Của Dự Án

| Nhánh | Mục đích | Quyền thao tác |
| :--- | :--- | :--- |
| `main` | **Bản chính thức (Production)** - Chỉ chứa code ổn định đã qua kiểm duyệt | Người duyệt (Lead / Owner) merge vào, nhân viên không push trực tiếp |
| `dev` | **Bản phát triển (Development)** | Nhân viên code tính năng, sửa lỗi và đẩy lên nhánh này |

---

## 👥 2. Cách Mời Bạn Bè / Nhân Viên Vào Xem & Code Cùng

Sau khi đẩy Repo lên GitHub:
1. Vào trang repository trên GitHub: `https://github.com/hieutrinhminh2512/<tên-repo>`
2. Bấm vào tab **Settings** (Cài đặt) trên thanh menu của repo.
3. Ở menu bên trái, chọn **Collaborators** (Cộng tác viên).
4. Bấm nút màu xanh **Add people** (Thêm người).
5. Nhập **Username** hoặc **Email GitHub** của nhân viên / bạn bè rồi bấm **Add to this repository**.
6. Người kia sẽ nhận được email lời mời (hoặc vào link repo để bấm **Accept invitation**). Sau khi đồng ý, họ có toàn quyền clone, commit và tạo nhánh.

---

## 🛡️ 3. Thiết Lập Khóa Nhánh `main` Để Bắt Buộc Duyệt Code

Để tránh nhân viên vô tình push thẳng vào `main` làm hỏng bản chuẩn:
1. Trong **Settings** > chọn mục **Branches** (bên trái).
2. Bấm **Add branch protection rule** (hoặc Add rule).
3. Tại ô **Branch name pattern**, gõ: `main`
4. Tích chọn các ô:
   - ✅ **Require a pull request before merging** (Bắt buộc phải tạo Pull Request mới được vào `main`).
   - ✅ **Require approvals** (Chọn số lượng người duyệt, ví dụ: 1 người).
5. Cuộn xuống dưới cùng và bấm **Create** (hoặc Save changes).

---

## 🔄 4. Quy Trình Làm Việc Hằng Ngày Cho Nhân Viên & Người Duyệt

### Cho Nhân Viên (Coder):
1. **Lấy code mới nhất**:
   ```bash
   git pull origin dev
   ```
2. **Code tính năng hoặc sửa lỗi**, sau đó commit và đẩy lên `dev`:
   ```bash
   git add .
   git commit -m "feat: nâng cấp map hoặc tính năng mới"
   git push origin dev
   ```
3. **Yêu cầu duyệt**:
   - Lên GitHub, bấm vào tab **Pull requests** > **New pull request**.
   - Chọn: `base: main` $\leftarrow$ `compare: dev`.
   - Bấm **Create pull request** và gửi link cho người duyệt.

---

### Cho Người Duyệt (Reviewer / Lead):
1. Vào tab **Pull requests** trên GitHub.
2. Bấm vào Pull Request của nhân viên để xem mục **Files changed** (xem những gì nhân viên đã thay đổi).
3. Nếu code chuẩn:
   - Bấm nút **Merge pull request** $\rightarrow$ **Confirm merge**.
   - Code từ `dev` sẽ được tự động gộp an toàn vào nhánh `main`!
4. Nếu code chưa đạt: Viết comment nhận xét để nhân viên sửa lại trên nhánh `dev`.
