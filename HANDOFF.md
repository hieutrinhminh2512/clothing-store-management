# Bàn giao: Speed Rush: Open City (ngày 14/10/2026)

Code đang làm dở, chưa test hết. Commit này chứa toàn bộ thay đổi tính đến lúc dừng. Hãy pull về máy khác rồi làm tiếp từ file này.

## 1. Đã xong (commit `9fb3194`, đã test)
- Game thế giới mở mới trong `open-world/`, viết bằng Three.js r128, không cần build. Mở `open-world/index.html` là chơi được.
- Bản đồ có thành phố, đường vành đai cao tốc, đường băng, công viên nhào lộn và bãi biển.
- Có 8 xe, nâng cấp được. Vật lý có drift, nitro và nhảy.
- Có xe cộ giao thông, cảnh sát truy đuổi, 8 sự kiện đua và vật phẩm để nhặt.
- Hình ảnh có bloom HDR và chu kỳ ngày/đêm. Có garage, bản đồ lớn và GPS.
- Đã sửa lỗi bản đua cũ trong `racing-game/`. Server Node (`racing-game/server.js`) phục vụ luôn bản mới ở `http://localhost:3000/open-world/`.

## 2. Yêu cầu đang làm (tiến độ lúc dừng)
Người dùng yêu cầu:
- ban đêm bớt lòe loẹt, chói mắt; game chạy mượt hơn;
- có nhân vật đi bộ như GTA 5;
- có đăng nhập và tài khoản admin toàn quyền;
- có nút xuống xe, nút thoát ra màn hình chính và nút đổi xe.

Việc được chia thành 4 luồng. Mỗi luồng có bản giao việc đầy đủ trong `handoff/brief-*.txt`, ghi rõ file nào luồng đó được sửa, API cần giữ và cách test.

Kiểm tra lúc dừng: mọi file JS qua `node --check`. Game load không có lỗi console. Đã thử xuống xe (F), đi bộ và lên lại xe, đều chạy được. **Chưa test kỹ từng phần.**

### Luồng 1: Ban đêm và hiệu năng (`brief-1-night-perf.txt`)
File được sửa: `render.js`, `world.js`, `textures.js`, phần hiệu ứng của `vehicle.js`, và chỉ màu đèn trong `cars.js`.

Đã làm:
- Thêm preset chất lượng mới, gồm `minPR`, `fogFar`, `bloomLv`, `bloomDiv`, `shadowR`.
- Thêm độ phân giải động (`R.dynRes`).
- Chia props thành chunk 480 m (`chunked()` trong `world.js`) để frustum culling hoạt động, kèm cull theo khoảng cách.
- Đã giảm độ sáng đèn, neon, cửa sổ và đèn pha.

Còn phải làm:
- Agent dừng đúng lúc đang **sửa phần chunk của tòa nhà (buildings) trong `world.js`**. Cần kiểm tra tòa nhà có hiển thị đúng không, có thiếu hay bị cull sai không.
- Chụp ảnh ban đêm so với `before` để đánh giá độ dịu mắt.
- Đo FPS ở low, medium và high. Lần đo thử được 7 FPS, nhưng lúc đó có 5 tab game chạy cùng lúc nên số này không đáng tin.
- Thư mục `.base/` (không commit) từng là bản sao code gốc để so FPS. Nếu cần bản gốc thì dùng `git show 9fb3194:<file>`.

### Luồng 2: Nhân vật đi bộ kiểu GTA (`brief-2-character.txt`)
File được sửa: `character.js` (mới), `main.js`, `traffic.js`.

Đã làm:
- `G.Character` là người dựng bằng hình khối, có animation đứng, đi, chạy, nhảy và rơi.
- API: `G.Game.onFoot`, `exitVehicle()`, `enterVehicle()`, `toggleVehicle()`, `G.Game.focus()`.
- Phím F để xuống/lên xe. Camera đi bộ xoay được bằng chuột phải.
- Xe đỗ vẫn nằm lại trong thế giới (`Gm.parked`).
- Trong `handleKeys` đã đưa F lên trước và gộp với `padY`.

Còn phải làm:
- Test cướp xe giao thông: xe phải bị xóa khỏi `G.Traffic` và thay bằng một `G.Vehicle`.
- Test cảnh sát đuổi khi đang đi bộ (bị bắt thì busted).
- Test không cho xuống xe khi đang đua (phải hiện toast).
- Test va chạm với nhà, cây, biển và dốc.
- Kiểm tra lỗi ở mọi trạng thái.

### Luồng 3: Đăng nhập, tài khoản và admin (`brief-3-auth-admin.txt`)
File được sửa: `auth.js`, `admin.js`, `css/auth.css`, `core.js`.

Đã làm:
- `G.Auth` (389 dòng): đăng nhập, đăng ký, chơi khách, ghi nhớ đăng nhập, khóa tạm khi sai mật khẩu nhiều lần.
- Mật khẩu hash SHA-256 có salt, kèm bản SHA-256 viết bằng JS để chạy khi mở qua file://.
- Mỗi tài khoản có save riêng: `SPEEDRUSH_OPENCITY_V1:<username>`.
- `G.Admin` (394 dòng): mở bằng F2 hoặc `` ` ``.
- Các luồng đăng nhập sai, đăng ký, tự đăng nhập, khách và khóa tạm đã được test.

**Tài khoản admin mặc định: `admin` / `SpeedRush@2026`.** Đổi mật khẩu trong bảng admin.

Còn phải làm:
- Agent đang chạy lại test phần quản lý user, debug overlay và phím Escape trong bảng admin.
- Test từng tính năng admin: tiền, mở khóa xe, nâng cấp tối đa, god mode, nitro vô hạn, tốc độ, cảnh sát, thời gian, dịch chuyển, xe, mật độ giao thông, chất lượng.
- Kiểm tra dữ liệu tách riêng giữa các tài khoản.
- Lưu ý: xác thực chỉ chạy ở phía trình duyệt nên **không phải bảo mật thật**.

### Luồng 4: Menu, thoát xe, đổi xe (`brief-4-menus.txt`)
File được sửa: `ui.js`, `css/style.css`, `events.js`, `index.html`. Luồng này gần xong và đã test phần lớn.

Đã làm:
- Thanh thao tác nhanh trên HUD: Xuống/Lên xe (F), Đổi xe (V), Gara (G), Bản đồ (M), Menu (Esc), Thoát.
- Bảng đổi xe nhanh (V, chọn bằng phím số). Esc đóng bảng mà không bật pause.
- Menu pause có Đổi xe, Xuống xe, Thoát ra màn hình chính (hỏi xác nhận nếu đang đua) và Đăng xuất.
- Màn hình tiêu đề có Tiếp tục, Đổi xe, Tài khoản và Thoát game.
- Garage có nút đóng to và mũi tên chuyển xe.
- Màn hình kết quả có Đua lại (phím R) và Về thế giới mở.
- HUD chỉ ghi DOM khi giá trị thay đổi.

Còn phải làm:
- Thoát game bằng `window.close()` chỉ đóng được tab do script mở. Cần kiểm tra trường hợp mở tab thường thì có hiện màn hình tạm biệt không.
- Test nút cảm ứng (F, V) trên điện thoại.
- Kiểm tra việc tắt `backdrop-filter` ở chất lượng low/medium.

## 3. Việc cuối sau khi xong cả 4 luồng
1. Test tích hợp toàn bộ: đăng nhập, chơi, đi bộ, cướp xe, đua, cảnh sát, admin, đăng xuất. Không được có lỗi console.
2. Đo FPS trên máy yếu (Intel HD 620) với chất lượng medium.
3. Cập nhật `README.md` (điều khiển mới, tài khoản admin).
4. Xóa thư mục `handoff/` và file này, rồi commit và push lên `main`.

## 4. Cách chạy và test
```bash
node handoff/serve.js .          # server tĩnh ở http://localhost:8765, mở /open-world/index.html
# hoặc: cd racing-game && npm ci && node server.js  → http://localhost:3000/open-world/
```
Mẹo test trong console:
- Bỏ qua màn đăng nhập: `G.Game.toTitle(); document.getElementById('btnPlay').click()`.
- Chuyển sang ban đêm: `G.save.hour=22`.
- Lái xe: `G.input.keys.KeyW=true`.
- Bấm phím: `G.input.press('KeyF')`.
- Dịch chuyển: `G.Game.player.setPose(x,z,heading)`.

Nếu nhờ Claude làm tiếp: bảo nó đọc file này, rồi đọc `handoff/brief-*.txt` của luồng cần làm. Trong các bản giao việc có đường dẫn `C:\Users\linh\...` và có nhắc đến các agent làm song song, hãy thay đường dẫn bằng thư mục repo trên máy mới.
