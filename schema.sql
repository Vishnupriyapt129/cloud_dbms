-- CloudHub MySQL Database Schema

CREATE DATABASE IF NOT EXISTS cloudhub;
USE cloudhub;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    storage_used_gb DECIMAL(10, 2) DEFAULT 0.00,
    storage_total_gb DECIMAL(10, 2) DEFAULT 20.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Folders Table
CREATE TABLE IF NOT EXISTS folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT NOT NULL,
    color VARCHAR(20) DEFAULT 'yellow',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    size_str VARCHAR(20) NOT NULL,
    icon VARCHAR(20) DEFAULT 'new',
    folder_id INT,
    owner_id INT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Access Control Table
CREATE TABLE IF NOT EXISTS file_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('Viewer', 'Editor', 'Admin') DEFAULT 'Viewer',
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_access (file_id, user_id)
);

-- Activity Log Table
CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(255) NOT NULL,
    icon VARCHAR(50) DEFAULT 'check',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert Initial Mock Data so your dashboard isn't completely empty!
INSERT INTO users (name, email, password_hash, role, storage_used_gb) 
VALUES ('Anvi', 'anvi@cloudhub.local', 'mockhash_admin', 'admin', 7.8);

INSERT INTO users (name, email, password_hash, role) 
VALUES ('Emily', 'emily@cloudhub.local', 'mockhash_user', 'user'),
       ('Mark', 'mark@cloudhub.local', 'mockhash_user', 'user'),
       ('Sarah', 'sarah@cloudhub.local', 'mockhash_user', 'user');

INSERT INTO folders (name, owner_id) VALUES 
('Work Files', 1), ('Photos', 1), ('Reports', 1), ('Personal Docs', 1);

INSERT INTO files (filename, file_type, size_str, icon, folder_id, owner_id) VALUES
('design_doc.pdf', 'PDF', '1.2 MB', 'pdf', 1, 1),
('data_report.xlsx', 'Excel', '550 KB', 'excel', 1, 1),
('summer_vacation.jpg', 'Image', '4.1 MB', 'image', 2, 1);

INSERT INTO file_access (file_id, user_id, role) VALUES 
(1, 2, 'Editor'), (1, 3, 'Viewer'), (1, 4, 'Admin');

INSERT INTO activity_log (user_id, action, target, icon) VALUES 
(1, 'logged in', 'system', 'login'),
(2, 'shared', 'design_doc.pdf', 'share');
