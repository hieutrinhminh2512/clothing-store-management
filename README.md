# 🌆 MỚI: Speed Rush — Open City (thế giới mở)

Bản thế giới mở nằm trong thư mục `open-world/`. **Mở `open-world/index.html`** bằng trình duyệt (hoặc chạy server bên dưới rồi vào `http://localhost:3000/open-world/`).

- **Bản đồ ~5×5 km**: thành phố 12×12 block (trung tâm cao ốc, khu văn phòng, khu dân cư, công viên, quảng trường đài phun nước, sân vận động), đường cao tốc vành đai, đường băng sân bay 1.7 km, bãi stunt với mega ramp, bãi biển & biển, đồi núi xa.
- **8 siêu xe** (hatchback, muscle, sedan, SUV off-road, GT, 2 hypercar, xe F1) — model 3D có hốc bánh, sơn clear-coat phản chiếu, đèn, cánh gió; nâng cấp động cơ/khung gầm/nitro, đổi màu.
- **Vật lý lái**: drift bằng phanh tay, nitro, nhảy dốc & bay, va chạm tường/xe, mặt đường khác nhau (nhựa/cỏ/cát).
- **Giao thông AI** chạy đúng làn, rẽ ở giao lộ, dừng đèn đỏ. **Cảnh sát truy đuổi** 5 cấp sao (cắt đuôi = thưởng, bị bắt = nộp phạt).
- **8 sự kiện**: 2 đua đường phố, đua vòng cao tốc (AI), bẫy tốc độ, drift zone, time attack bờ biển, nhảy xa, truy nã. **108 đồng xu** sưu tầm.
- **Đồ hoạ**: HDR + bloom + ACES, ngày/đêm động (bình minh, hoàng hôn, sao, mây), đèn đường, cửa sổ sáng đèn ban đêm, biển gợn sóng, khói lốp, vệt phanh, tia lửa. 4 mức đồ hoạ (tự chọn theo GPU).
- Âm thanh tổng hợp (động cơ theo vòng tua, lốp rít, gió, còi hú), minimap xoay + bản đồ lớn có GPS, hỗ trợ tay cầm & màn hình cảm ứng, lưu tiến độ tự động.
- **Đi bộ kiểu GTA**: xuống xe, đi/chạy/nhảy, lên lại xe hoặc **cướp xe giao thông**; cảnh sát vẫn truy đuổi khi đi bộ.
- **Tài khoản**: đăng nhập / đăng ký / chơi khách, mỗi tài khoản có tiến trình riêng. Tài khoản **admin** có bảng quản trị toàn quyền.
- Thanh thao tác nhanh trên HUD (xuống xe, đổi xe, gara, bản đồ, menu, thoát), bảng **đổi xe nhanh**, menu tạm dừng có thoát ra màn hình chính.

**Phím lái xe**: W/S ga-phanh • A/D lái • Space phanh tay • Shift nitro • E sự kiện • G gara • M bản đồ • C camera • R đặt lại xe • H còi • T +1 giờ • Esc menu

**Phím mới**: F xuống / lên xe (gần xe giao thông = cướp xe) • V hoặc Tab đổi xe nhanh (phím số 1–9 để chọn) • Khi đi bộ: WASD đi, Shift chạy, Ctrl/Alt đi chậm, Space nhảy, kéo chuột hoặc Q/E để xoay camera • R ở màn kết quả = đua lại

**Tài khoản admin mặc định**: `admin` / `SpeedRush@2026`. Hãy đổi mật khẩu ngay trong bảng admin (F2 hoặc phím `` ` `` › TÀI KHOẢN). Bảng admin có: tiền, mở khoá xe, nâng cấp tối đa, bất tử, nitro vô hạn, hệ số tốc độ, cảnh sát, giờ trong ngày, dịch chuyển, lấy xe bất kỳ, mật độ giao thông, chất lượng đồ hoạ, overlay FPS, quản lý tài khoản.

> Đăng nhập chỉ chạy phía trình duyệt (lưu trong localStorage) nên **không phải bảo mật thật**: đủ để tách tiến trình giữa các người chơi trên cùng một máy, không dùng để bảo vệ dữ liệu.

---

# Speed Rush 3D - Cyber Highway Racing Game 🏎️💨

Game đua xe 3D đồ họa cao cấp xây dựng bằng Three.js, phong cách đường cao tốc đêm mưa (Cyber City / Need for Speed / Asphalt), hệ thống Showroom 3D, độ xe (Tuning), tài khoản và tiền tệ người chơi, cùng chế độ Multiplayer qua Socket.io.

---

## 🌟 Tính Năng Nổi Bật

- **Đồ họa 3D Chân Thực**:
  - Mặt đường ướt phản chiếu ánh sáng (Wet Asphalt Shader) với vũng nước và vạch kẻ đường neon.
  - Tàu điện trên không (Monorail) chạy song song với dải đèn LED neon phát sáng.
  - Thành phố đêm cao ốc chọc trời với cửa sổ sáng rực rỡ và bầu trời sương mù khí quyển.
  - Xe cảnh sát tuần tra bên lề đường với còi đèn nhấp nháy đỏ - xanh sinh động.
  - Đồng hồ đo tốc độ (Speedometer) kỹ thuật số phong cách tròn thể thao kèm thanh Nitro gauge.
- **Hệ Thống Siêu Xe Showroom 3D**:
  - **Apex GT-R**: Xe thể thao cân bằng, tốc độ cao.
  - **Phantom V12 (Bugatti Chiron Style)**: Siêu xe cơ bắp với động cơ V12 mạnh mẽ.
  - **Koenigsegg Jesko Hyper**: Thần gió khí động học, vận tốc cực đại đỉnh cao.
  - **Cyber SVJ (Lamborghini SVJ Style)**: Góc cạnh hầm hố, cánh gió đôi, tăng tốc xé gió.
- **Xưởng Nâng Cấp (Garage & Tuning)**:
  - Nâng cấp Động cơ (Engine Level), Nitro Boost, Phanh & Phục hồi lực kéo (Handling & Brakes).
  - Tùy biến màu sơn xe thời gian thực với bảng màu siêu xe phong phú.
- **Hệ Thống Tài Khoản & Lưu Dữ Liệu**:
  - Đăng ký / Đăng nhập tài khoản người chơi.
  - Lưu trữ tiến độ, tiền thưởng (Cash), danh sách xe đã sở hữu và cấp độ nâng cấp vào `localStorage`.
- **Chế Độ Chơi**:
  - Chơi đơn (Singleplayer): Trải nghiệm mượt mà, không giật lag ngay trên trình duyệt mà không cần cài đặt.
  - Chơi nhiều người (Multiplayer): Server Node.js + Socket.io hỗ trợ phòng chơi và mời bạn bè đua cùng thời gian thực.

---

## 🎮 Cách Chơi

- **Mũi tên Lên / Phím W**: Tăng ga (Accelerate)
- **Mũi tên Xuống / Phím S**: Phanh / Lùi (Brake / Reverse)
- **Mũi tên Trái - Phải / Phím A - D**: Đánh lái Trái / Phải (Steer Left / Right)
- **Phím Space (Cách)**: Kích hoạt NITRO Siêu Tốc (Nitro Boost)
- **Phím C**: Đổi góc nhìn Camera (Góc nhìn thứ 3 / Góc nhìn cận cảnh)
- **Phím R**: Reset vị trí xe khi bị lật hoặc kẹt

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Chơi Trực Tiếp (Bản Độc Lập)
Chỉ cần nhấp đúp vào file `SpeedRush3D.html` trên bất kỳ trình duyệt nào (Chrome, Edge, Firefox, Brave) là có thể chơi ngay lập tức!

### 2. Khởi Chạy Server Chơi Cùng Bạn Bè (Multiplayer)
1. Mở terminal tại thư mục `racing-game`:
   ```bash
   cd racing-game
   npm install
   npm start
   ```
2. Mở trình duyệt truy cập: `http://localhost:3000`
3. Chia sẻ địa chỉ mạng LAN hoặc dùng Ngrok/Cloudflare Tunnel để bạn bè cùng mạng/khác mạng có thể tham gia đua cùng!
