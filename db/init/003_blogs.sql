USE studentdb;

-- Safe to run on a new database and on an older demo database created by 002_studentdb.sql.
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
