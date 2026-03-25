-- CloudHub MySQL Database Schema
-- Matches ER Diagram exactly: Users, Files, Folders, Access_control, Activity_log

DROP DATABASE IF EXISTS cloudhub;
CREATE DATABASE IF NOT EXISTS cloudhub;
USE cloudhub;

-- ============================================================
-- ENTITY: Users
-- Attributes: user_id (PK), username, fname, mname, lname,
--             email, password, role, created_at
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id          INT AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(100) NOT NULL,
    fname            VARCHAR(60)  NOT NULL,
    mname            VARCHAR(60)  DEFAULT NULL,
    lname            VARCHAR(60)  NOT NULL,
    email            VARCHAR(100) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('admin', 'user') DEFAULT 'user',
    storage_used_gb  DECIMAL(10, 2) DEFAULT 0.00,
    storage_total_gb DECIMAL(10, 2) DEFAULT 20.00,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ENTITY: Folders
-- Attributes: folder_id (PK), foldername, created_by (FK → users)
-- Relationship: Users CREATES Folders  (1 : M)
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
    folder_id    INT AUTO_INCREMENT PRIMARY KEY,
    foldername   VARCHAR(100) NOT NULL,
    created_by   INT NOT NULL,
    color        VARCHAR(20)  DEFAULT 'yellow',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- ENTITY: Files
-- Attributes: file_id (PK), filename, filetype, filesize, uploaddate
-- Relationship: Users UPLOADS Files  (1 : M)
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
    file_id      INT AUTO_INCREMENT PRIMARY KEY,
    filename     VARCHAR(255) NOT NULL,
    filetype     VARCHAR(50)  NOT NULL,
    filesize     VARCHAR(20)  NOT NULL,
    icon         VARCHAR(20)  DEFAULT 'new',
    folder_id    INT,
    owner_id     INT NOT NULL,
    uploaddate   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id)  REFERENCES users(user_id)    ON DELETE CASCADE
);

-- ============================================================
-- ENTITY: Access_control
-- Attributes: access_id (PK), user_id (FK), file_id (FK), permission
-- Relationship: Users & Files connected through PERMISSION  (M : M)
-- ============================================================
CREATE TABLE IF NOT EXISTS access_control (
    access_id   INT AUTO_INCREMENT PRIMARY KEY,
    file_id     INT NOT NULL,
    user_id     INT NOT NULL,
    permission  ENUM('Viewer', 'Editor', 'Admin') DEFAULT 'Viewer',
    FOREIGN KEY (file_id)  REFERENCES files(file_id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(user_id)   ON DELETE CASCADE,
    UNIQUE KEY unique_access (file_id, user_id)
);

-- ============================================================
-- ENTITY: Activity_log
-- Attributes: log_id (PK), user_id (FK), file_id (FK), action, action_time
-- Relationship: Files LOGS Activity_log  (1 : M)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
    log_id      INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    action      VARCHAR(150) NOT NULL,
    file_id     INT          DEFAULT NULL,
    action_desc VARCHAR(255) DEFAULT NULL,
    action_icon VARCHAR(50)  DEFAULT 'check',
    action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)  ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(file_id)  ON DELETE SET NULL
);

-- ============================================================
-- Extra: User Requests (Admin Approval System)
-- Not in the original ER but required for the admin workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS user_requests (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    request_type VARCHAR(50)  NOT NULL,
    reason       TEXT         NOT NULL,
    status       ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================
-- ENTITY: Contact Queries (From Landing Page)
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_queries (
    query_id     INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    email        VARCHAR(100) NOT NULL,
    message      TEXT NOT NULL,
    status       ENUM('unread', 'read') DEFAULT 'unread',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SEED DATA
-- ============================================================

-- Admin users
INSERT INTO users (username, fname, lname, email, password_hash, role, storage_used_gb) 
VALUES 
    ('anusha',      'Anusha',      'Admin',    'anushakpramod24@gmail.com',      'mockhash_admin', 'admin', 7.8),
    ('vishnupriya', 'Vishnupriya', 'Admin',    'vishnupriyapt29@gmail.com', 'mockhash_admin', 'admin', 5.2);

-- Regular users
INSERT INTO users (username, fname, lname, email, password_hash, role)
VALUES
    ('emily_j', 'Emily',  'Johnson', 'emily@cloudhub.local', 'mockhash_user', 'user'),
    ('mark_s',  'Mark',   'Spencer', 'mark@cloudhub.local',  'mockhash_user', 'user'),
    ('sarah_k', 'Sarah',  'Kim',     'sarah@cloudhub.local', 'mockhash_user', 'user');

-- Folders (created_by = user_id of Anusha = 1)
INSERT INTO folders (foldername, created_by) VALUES 
    ('Work Files',   1),
    ('Photos',       1),
    ('Reports',      1),
    ('Personal Docs',1);

-- Files (uploaded by Anusha = owner_id 1)
INSERT INTO files (filename, filetype, filesize, icon, folder_id, owner_id) VALUES
    ('design_doc.pdf',    'PDF',   '1.2 MB', 'pdf',   1, 1),
    ('data_report.xlsx',  'Excel', '550 KB', 'excel', 1, 1),
    ('summer_vacation.jpg','Image','4.1 MB', 'image', 2, 1);

-- Access control (M:M between Users and Files via permission)
INSERT INTO access_control (file_id, user_id, permission) VALUES 
    (1, 2, 'Editor'),
    (1, 3, 'Viewer'),
    (1, 4, 'Admin');

-- Activity log (with file_id FK)
INSERT INTO activity_log (user_id, action, file_id, action_desc, action_icon) VALUES 
    (1, 'logged in',   NULL, 'system',         'login'),
    (2, 'shared',      1,    'design_doc.pdf',  'share');

-- Pending user requests (for admin approval demo)
INSERT INTO user_requests (user_id, request_type, reason, status) VALUES 
    (3, 'Storage Upgrade',   'Need 50GB more storage for video editing project files.',   'pending'),
    (4, 'Premium Access',    'Requesting editor access to the master design folders.',    'pending'),
    (5, 'Server Provisioning','Need a dedicated testing database server for the team.',   'rejected');

-- Initial user query from the landing page
INSERT INTO contact_queries (name, email, message, status) VALUES 
    ('Emily', 'emily@cloudhub.local', 'I have a question about the enterprise pricing tier.', 'unread');
