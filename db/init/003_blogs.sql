USE studentdb;

CREATE TABLE IF NOT EXISTS blogs (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,
  content    TEXT         NOT NULL,
  author_id  VARCHAR(10)  NOT NULL,
  image_url  VARCHAR(500),
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_author (author_id)
);

INSERT INTO blogs (title, content, author_id, image_url) VALUES
  ('Docker Deep Dive', 'Docker revolutionized how we ship software by packaging applications and their dependencies into lightweight, portable containers.', 'SV001', NULL),
  ('Introduction to Kubernetes', 'Kubernetes (K8s) is an open-source container orchestration system for automating deployment, scaling, and management of containerized applications.', 'SV002', NULL),
  ('Cloud Native Architecture', 'Cloud native technologies empower organizations to build and run scalable applications in modern, dynamic environments such as public, private, and hybrid clouds.', 'SV003', NULL);
