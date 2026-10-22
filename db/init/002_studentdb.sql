CREATE DATABASE IF NOT EXISTS studentdb;
USE studentdb;

CREATE TABLE IF NOT EXISTS students (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  student_id VARCHAR(10),
  fullname   VARCHAR(100),
  dob        DATE,
  major      VARCHAR(50)
);

INSERT INTO students (student_id, fullname, dob, major) VALUES
  ('SV001', 'Nguyen Van A', '2002-03-15', 'Computer Science'),
  ('SV002', 'Tran Thi B',   '2001-11-02', 'Data Science'),
  ('SV003', 'Le Van C',     '2002-07-20', 'Cybersecurity'),
  ('SV004', 'Pham Thi D',   '2003-01-10', 'AI Engineering'),
  ('SV005', 'Hoang Van E',  '2002-09-05', 'Software Engineering');

CREATE TABLE IF NOT EXISTS blogs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_id VARCHAR(50) NOT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO blogs (id, title, content, author_id, image_url) VALUES
  (1, 'Docker Deep Dive: Công nghệ Container hóa', 'Docker đã tạo ra một cuộc cách mạng trong phát triển phần mềm bằng cách đóng gói mã nguồn và toàn bộ thư viện phụ thuộc vào các Container độc lập. Nhờ cơ chế Linux Namespaces (cô lập PID, Network, Mount) và Control Groups (giới hạn CPU, RAM), container khởi động tức thì và chiếm dụng cực ít tài nguyên máy chủ.', 'SV001', 'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=800&auto=format&fit=crop&q=80'),
  (2, 'Cloud Computing 101: IaaS, PaaS, SaaS', 'Điện toán đám mây cung cấp tài nguyên CNTT theo nhu cầu qua mạng Internet với mô hình chi trả linh hoạt. Ba trụ cột chính gồm IaaS (hạ tầng như AWS EC2), PaaS (nền tảng như Elastic Beanstalk) và SaaS (phần mềm hoàn chỉnh) tạo nên hệ sinh thái hạ tầng số hiện đại.', 'SV002', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80'),
  (3, 'Microservices & Kiến trúc API Gateway', 'Kiến trúc Vi dịch vụ phân rã ứng dụng lớn thành các dịch vụ độc lập, tự chủ. API Gateway đóng vai trò làm điểm tiếp nhận đơn nhất, điều phối lưu lượng, cân bằng tải thuật toán Round-Robin luân phiên 1:1 và xác thực không trạng thái qua OpenID Connect JWT.', 'SV003', 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80')
ON DUPLICATE KEY UPDATE title=VALUES(title);
