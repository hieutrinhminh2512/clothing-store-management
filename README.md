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
