HÀN THIÊN MÔN – BẢN POSTGRESQL

Bản này đã chuyển database từ SQLite sang PostgreSQL để phù hợp triển khai cloud lâu dài.

LOCAL:
1. Cài Node.js.
2. Cài PostgreSQL và tạo DATABASE_URL.
3. npm install
4. DATABASE_URL="postgresql://..." npm start

RENDER:
1. Đưa toàn bộ thư mục lên GitHub.
2. Trong Render chọn New -> Blueprint và chọn repository.
3. Render đọc render.yaml, tạo Web Service + PostgreSQL.
4. Chờ deploy xong, mở URL .onrender.com.

Lưu ý: Không đưa mật khẩu database vào mã nguồn. DATABASE_URL phải nằm trong Environment Variables/Blueprint của Render.
