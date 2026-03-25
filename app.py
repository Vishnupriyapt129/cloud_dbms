from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from datetime import datetime
import pymysql
import pymysql.cursors
import smtplib
from email.message import EmailMessage

def send_approval_email(to_email, username):
    sender_email = "cloudhub.admin1@gmail.com" # Put your real Gmail here
    sender_password = "YOUR_APP_PASSWORD" # Generate an App Password in Gmail settings
    
    msg = EmailMessage()
    msg['Subject'] = 'CloudHub - Access Approved!'
    msg['From'] = f"CloudHub Admin <{sender_email}>"
    msg['To'] = to_email
    msg.set_content(f"Hello {username},\n\nYour request to access CloudHub has been approved by the admin! You can now log in to your account at http://localhost:5000/login.html.\n\nBest,\nCloudHub Team")
    
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=5) as smtp:
            smtp.login(sender_email, sender_password)
            smtp.send_message(msg)
            print(f"Sent approval email to {to_email}")
    except Exception as e:
        print(f"Warning: Failed to send email to {to_email}. Ensure SMTP details are correctly configured. Error: {e}")

app = Flask(__name__, template_folder='frontend', static_folder='frontend', static_url_path='')
CORS(app)

@app.errorhandler(Exception)
def handle_exception(e):
    code = getattr(e, 'code', 500)
    return jsonify({"status": "error", "message": str(e)}), code

# ---------------------------------------------------------
# MySQL DATABASE CONFIGURATION (PyMySQL)
# ---------------------------------------------------------
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'password',
    'database': 'cloudhub',
    'connect_timeout': 5
}

def get_db_connection():
    try:
        connection = pymysql.connect(**DB_CONFIG)
        return connection
    except pymysql.MySQLError as e:
        print(f"Error connecting to MySQL: {e}")
        return None

# ---------------------------------------------------------
# PAGE ROUTES
# ---------------------------------------------------------

@app.route('/')
def root():
    return render_template('home.html')

@app.route('/home.html')
def home():
    return render_template('home.html')

@app.route('/login.html')
def login():
    return render_template('login.html')

@app.route('/index.html')
def index():
    return render_template('index.html')

# ---------------------------------------------------------
# USER PROFILE  (uses: users.user_id, username, storage_*)
# ---------------------------------------------------------

@app.route('/api/user', methods=['GET'])
def get_user_profile():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "Database connection failed"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT user_id, username, email, storage_used_gb, storage_total_gb "
        "FROM users WHERE user_id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user:
        used  = float(user['storage_used_gb'])
        total = float(user['storage_total_gb'])
        return jsonify({
            "status": "success",
            "data": {
                "id":   str(user['user_id']),
                "name": user['username'],
                "email": user['email'],
                "avatar_url": "",
                "storage": {
                    "used_gb":    used,
                    "total_gb":   total,
                    "percentage": (used / total) * 100 if total else 0
                }
            }
        }), 200
    return jsonify({"status": "error", "message": "User not found"}), 404

# ---------------------------------------------------------
# FOLDERS  (uses: folders.folder_id, foldername, created_by)
# ---------------------------------------------------------

@app.route('/api/folders', methods=['GET'])
def get_folders():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT folder_id AS id, foldername AS name, color FROM folders WHERE created_by = %s",
        (user_id,)
    )
    folders = cursor.fetchall()
    cursor.close()
    conn.close()

    formatted = [{"id": str(f['id']), "name": f['name'], "color": f['color']} for f in folders]
    return jsonify({"status": "success", "data": formatted}), 200


@app.route('/api/folders', methods=['POST'])
def create_folder():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"status": "error", "message": "Invalid payload."}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO folders (foldername, created_by) VALUES (%s, %s)",
        (data['name'], user_id)
    )
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user_id, 'created folder', data['name'], 'folder')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Folder created."}), 201

# ---------------------------------------------------------
# FILES  (uses: files.file_id, filename, filetype, filesize, uploaddate)
# ---------------------------------------------------------

@app.route('/api/files', methods=['GET'])
def get_files():
    user_id   = int(request.headers.get('Authorization', 1) or 1)
    folder_id = request.args.get('folder_id')
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    base_sql = (
        "SELECT file_id AS id, filename AS name, filetype AS type, filesize AS size, "
        "uploaddate AS date_raw, icon "
        "FROM files WHERE owner_id = %s"
    )
    if folder_id and folder_id != 'undefined':
        cursor.execute(base_sql + " AND folder_id = %s ORDER BY uploaddate DESC", (user_id, folder_id))
    else:
        cursor.execute(base_sql + " ORDER BY uploaddate DESC", (user_id,))

    files = cursor.fetchall()
    for f in files:
        f['id'] = str(f['id'])
        raw = f.pop('date_raw', None)
        f['date_modified'] = raw.strftime('%b %d, %Y') if raw else '—'
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": files}), 200


@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400

    folder_id = request.form.get('folder_id')
    if not folder_id or folder_id == 'undefined':
        folder_id = 1

    file.seek(0, 2)
    size_bytes = file.tell()
    file.seek(0, 0)
    if size_bytes >= 1024 * 1024:
        size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
    elif size_bytes >= 1024:
        size_str = f"{size_bytes / 1024:.0f} KB"
    else:
        size_str = f"{size_bytes} B"

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext == 'pdf':
        type_str, icon_str = 'PDF', 'pdf'
    elif ext in ['xls', 'xlsx']:
        type_str, icon_str = 'Excel', 'excel'
    elif ext in ['ppt', 'pptx']:
        type_str, icon_str = 'PowerPoint', 'powerpoint'
    elif ext in ['txt', 'csv']:
        type_str, icon_str = 'Text', 'text'
    elif ext in ['jpg', 'jpeg', 'png', 'gif']:
        type_str, icon_str = 'Image', 'image'
    else:
        type_str, icon_str = 'File', 'new'

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO files (filename, filetype, filesize, icon, folder_id, owner_id) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (file.filename, type_str, size_str, icon_str, folder_id, user_id)
    )
    new_file_id = cursor.lastrowid
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, file_id, action_desc, action_icon) VALUES (%s, %s, %s, %s, %s)",
        (user_id, 'uploaded', new_file_id, file.filename, 'upload')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "File uploaded."}), 201

# ---------------------------------------------------------
# ACCESS CONTROL  (uses: access_control — access_id, user_id, file_id, permission)
# ---------------------------------------------------------

@app.route('/api/access-control/<file_id>', methods=['GET'])
def get_access_control(file_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT filename FROM files WHERE file_id = %s", (file_id,))
    file_info = cursor.fetchone()
    file_name = file_info['filename'] if file_info else "Unknown File"

    cursor.execute(
        "SELECT ac.user_id AS id, u.username AS name, ac.permission AS role "
        "FROM access_control ac JOIN users u ON ac.user_id = u.user_id "
        "WHERE ac.file_id = %s",
        (file_id,)
    )
    users = cursor.fetchall()
    for u in users:
        u['id']     = str(u['id'])
        u['avatar'] = ""
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": {
        "file_id":   str(file_id),
        "file_name": file_name,
        "users":     users
    }}), 200


@app.route('/api/access-control/<file_id>/users', methods=['POST'])
def add_user_access(file_id):
    user_id_operator = int(request.headers.get('Authorization', 1) or 1)
    data = request.json
    if not data or 'email' not in data or 'role' not in data:
        return jsonify({"status": "error", "message": "Invalid payload."}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT user_id FROM users WHERE username = %s OR email = %s LIMIT 1",
        (data['email'], data['email'])
    )
    target_user = cursor.fetchone()

    if not target_user:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "User not found. Try 'emily_j', 'mark_s', or 'sarah_k'"}), 404

    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO access_control (file_id, user_id, permission) VALUES (%s, %s, %s)",
            (file_id, target_user['user_id'], data['role'])
        )
        cursor.execute(
            "INSERT INTO activity_log (user_id, action, file_id, action_desc, action_icon) VALUES (%s, %s, %s, %s, %s)",
            (user_id_operator, 'gave access to', int(file_id), data['email'], 'share')
        )
        conn.commit()
    except pymysql.IntegrityError:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "This user already has access to this file!"}), 400
    except Exception as e:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": f"SQL Error: {str(e)}"}), 500

    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Access granted."}), 201


@app.route('/api/access-control/<file_id>/users/<user_id>', methods=['DELETE'])
def remove_user_access(file_id, user_id):
    user_id_operator = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM access_control WHERE file_id = %s AND user_id = %s",
        (file_id, user_id)
    )
    if cursor.rowcount > 0:
        cursor.execute(
            "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
            (user_id_operator, 'removed access', 'user', 'trash')
        )
        conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Access removed."}), 200

# ---------------------------------------------------------
# ACTIVITY LOG  (uses: log_id, user_id, file_id, action, action_time)
# ---------------------------------------------------------

@app.route('/api/activity', methods=['GET'])
def get_activity_logs():
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("""
        SELECT
            a.log_id AS id,
            u.username AS user_name,
            a.action,
            COALESCE(f.filename, a.action_desc, '—') AS target,
            a.action_icon AS icon,
            CASE
              WHEN TIMESTAMPDIFF(MINUTE, a.action_time, NOW()) < 60
                THEN CONCAT(TIMESTAMPDIFF(MINUTE, a.action_time, NOW()), ' mins ago')
              WHEN TIMESTAMPDIFF(HOUR, a.action_time, NOW()) < 24
                THEN CONCAT(TIMESTAMPDIFF(HOUR, a.action_time, NOW()), ' hours ago')
              ELSE CONCAT(TIMESTAMPDIFF(DAY, a.action_time, NOW()), ' days ago')
            END AS time_ago
        FROM activity_log a
        JOIN users u ON a.user_id = u.user_id
        LEFT JOIN files f ON a.file_id = f.file_id
        ORDER BY a.action_time DESC LIMIT 10
    """)
    logs = cursor.fetchall()
    for l in logs:
        if l['time_ago'] == "0 mins ago":
            l['time_ago'] = "Just now"
        l['id'] = str(l['id'])
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": logs}), 200

# ---------------------------------------------------------
# USER SIGN-UP + AUTO REQUEST
# ---------------------------------------------------------

@app.route('/api/user/signup', methods=['POST'])
def user_signup():
    data = request.json
    if not data or 'name' not in data or 'email' not in data or 'reason' not in data:
        return jsonify({"status": "error", "message": "Missing required fields: name, email, reason"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT user_id FROM users WHERE email = %s", (data['email'],))
    existing = cursor.fetchone()

    try:
        if existing:
            user_id = existing['user_id']
            # Check if this user already has an accepted request
            cursor.execute("SELECT status FROM user_requests WHERE user_id = %s AND status = 'accepted' LIMIT 1", (user_id,))
            already_approved = cursor.fetchone()
            if already_approved:
                cursor.close()
                conn.close()
                return jsonify({"status": "already_accepted", "message": "You have already been accepted! Please access CloudHub through the User Login screen."}), 200
        else:
            name_parts = data['name'].strip().split()
            fname = name_parts[0]
            lname = name_parts[-1] if len(name_parts) > 1 else 'User'
            username = data['email'].split('@')[0]
            cursor.execute(
                "INSERT INTO users (username, fname, lname, email, password_hash, role) "
                "VALUES (%s, %s, %s, %s, %s, 'user')",
                (username, fname, lname, data['email'], data.get('password', 'dummy_pwd'))
            )
            user_id = cursor.lastrowid

        req_type = data.get('request_type', 'General Access')
        reason   = data['reason']
        cursor.execute(
            "INSERT INTO user_requests (user_id, request_type, reason, status) VALUES (%s, %s, %s, 'pending')",
            (user_id, req_type, reason)
        )
        cursor.execute(
            "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
            (user_id, 'submitted access request', req_type, 'share')
        )
        conn.commit()
    except Exception as e:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": f"Database error: {str(e)}"}), 500

    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": {"user_id": user_id}}), 201


@app.route('/api/user/status/<int:user_id>', methods=['GET'])
def get_user_status(user_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT status FROM user_requests WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
        (user_id,)
    )
    req = cursor.fetchone()
    cursor.close()
    conn.close()

    if not req:
        return jsonify({"status": "error", "message": "No request found for this user."}), 404

    return jsonify({"status": "success", "data": {"request_status": req['status']}}), 200

# ---------------------------------------------------------
# ADMIN — PENDING REQUESTS
# Criteria shown: user_role, account_age_days, reason, number_of_requests
# ---------------------------------------------------------

@app.route('/api/user/login', methods=['POST'])
def user_login():
    data = request.json
    if not data or 'email' not in data or 'password' not in data:
        return jsonify({"status": "error", "message": "Email and password required"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT user_id, password_hash, role FROM users WHERE email = %s", (data['email'],))
    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401

    if user['role'] == 'admin':
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Admins must use the administrator portal"}), 403

    if data['password'] != user['password_hash']:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401

    cursor.execute("""
        SELECT status FROM user_requests 
        WHERE user_id = %s 
        ORDER BY created_at DESC LIMIT 1
    """, (user['user_id'],))
    request_rec = cursor.fetchone()

    status = request_rec['status'] if request_rec else 'accepted'
    if status == 'pending':
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Account is still pending admin approval."}), 403
    elif status == 'rejected':
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Your access request was rejected."}), 403

    # Log the successful login
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user['user_id'], 'logged in', 'system', 'login')
    )
    conn.commit()

    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": {"user_id": user['user_id']}}), 200


@app.route('/api/admin/requests', methods=['GET'])
def get_user_requests():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role, email FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()
    
    admin_emails = ['anusha@gmail.com', 'vishnupriya@gmail.com']
    if not user or user['role'] != 'admin' or user['email'] not in admin_emails:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    cursor.execute("""
        SELECT
            r.id,
            u.username                               AS user_name,
            u.role                                   AS user_role,
            (SELECT COUNT(*) FROM activity_log 
             WHERE user_id = u.user_id AND action = 'logged in' 
             AND action_time >= NOW() - INTERVAL 1 DAY) AS recent_logins,
            r.request_type,
            r.reason,
            (SELECT COUNT(*) FROM user_requests
             WHERE user_id = u.user_id)              AS number_of_requests,
            r.created_at                             AS date_requested,
            r.status
        FROM user_requests r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
    """)
    requests_data = cursor.fetchall()
    for req in requests_data:
        req['id'] = str(req['id'])
        raw = req.get('date_requested')
        if hasattr(raw, 'strftime'):
            req['date_requested'] = raw.strftime('%b %d, %Y')
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": requests_data}), 200


@app.route('/api/admin/requests/<request_id>/<action>', methods=['POST'])
def manage_user_request(request_id, action):
    user_id_operator = int(request.headers.get('Authorization', 1) or 1)
    if action not in ['approve', 'reject']:
        return jsonify({"status": "error", "message": "Invalid action"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role, email FROM users WHERE user_id = %s", (user_id_operator,))
    user = cursor.fetchone()
    
    admin_emails = ['anusha@gmail.com', 'vishnupriya@gmail.com']
    if not user or user['role'] != 'admin' or user['email'] not in admin_emails:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    new_status = 'accepted' if action == 'approve' else 'rejected'
    cursor.execute("UPDATE user_requests SET status = %s WHERE id = %s", (new_status, request_id))

    cursor.execute(
        "SELECT u.username, u.email, r.request_type FROM user_requests r "
        "JOIN users u ON r.user_id = u.user_id WHERE r.id = %s",
        (request_id,)
    )
    req_info = cursor.fetchone()
    if req_info:
        log_action = f"{new_status} request"
        log_desc   = f"{req_info['request_type']} from {req_info['username']}"
        cursor.execute(
            "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
            (user_id_operator, log_action, log_desc, 'check' if action == 'approve' else 'trash')
        )
        
        if action == 'approve':
            # Run the email logic on approval
            send_approval_email(req_info['email'], req_info['username'])

    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": f"Request {new_status}."}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
