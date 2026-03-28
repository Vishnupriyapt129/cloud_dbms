from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from datetime import datetime
import pymysql
import pymysql.cursors
import os
from werkzeug.utils import secure_filename
from flask import send_from_directory

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, template_folder='frontend', static_folder='frontend', static_url_path='')
CORS(app)

@app.errorhandler(Exception)
def handle_exception(e):
    code = getattr(e, 'code', 500)
    return jsonify({"status": "error", "message": str(e)}), code

# ---------------------------------------------------------
# MySQL DATABASE CONFIGURATION (PyMySQL)
# ---------------------------------------------------------
db_host = os.environ.get('DB_HOST', 'localhost')
db_port = int(os.environ.get('DB_PORT', 3306))

# In case the user enters the port within the DB_HOST string (e.g. host.aivencloud.com:12345)
if ':' in db_host and db_host.count(':') == 1:
    db_host_split, port_str = db_host.split(':')
    db_host = db_host_split
    db_port = int(port_str)

# Include basic SSL if DB_REQUIRE_SSL is set, since many cloud providers require it
db_ssl_kwargs = {}
if os.environ.get('DB_REQUIRE_SSL', 'false').lower() == 'true':
    import ssl
    db_ssl_kwargs['ssl'] = ssl.create_default_context()

DB_CONFIG = {
    'host': db_host,
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'password'),
    'database': os.environ.get('DB_NAME', 'cloudhub'),
    'port': db_port,
    'connect_timeout': 10,
    **db_ssl_kwargs
}

def get_db_connection():
    try:
        connection = pymysql.connect(**DB_CONFIG)
        print("DB Connected")
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
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"status": "error", "message": "Authentication required. Please log in."}), 401
    user_id = int(auth_header)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "Database connection failed"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT user_id, username, email, role, storage_used_gb, storage_total_gb "
        "FROM users WHERE user_id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    
    if not user:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "User not found"}), 404

    # If Admin, fetch GLOBAL stats (System-wide 20 GB limit)
    user_count = None
    if user['role'] == 'admin':
        cursor.execute("SELECT COUNT(*) as total_users FROM users WHERE role = 'user'")
        uc = cursor.fetchone()
        user_count = uc['total_users'] if uc else 0

        cursor.execute("SELECT SUM(storage_used_gb) as total_used FROM users")
        global_stats = cursor.fetchone()
        used = float(global_stats['total_used'] or 0)
        total = 20.0 # Standard Platform Limit (20 GB as per request)
    else:
        used  = float(user['storage_used_gb'])
        total = float(user['storage_total_gb'])

    cursor.close()
    conn.close()

    return jsonify({
        "status": "success",
        "data": {
            "id":   str(user['user_id']),
            "name": user['username'],
            "email": user['email'],
            "role":  user['role'],
            "user_count": user_count,
            "avatar_url": "",
            "storage": {
                "used_gb":    used,
                "total_gb":   total,
                "percentage": (used / total) * 100 if total else 0
            }
        }
    }), 200

# ---------------------------------------------------------
# FOLDERS  (uses: folders.folder_id, foldername, created_by)
# ---------------------------------------------------------

@app.route('/api/folders', methods=['GET'])
def get_folders():
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        # Fallback for initialization if needed, but safer to return 401
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    user_id = int(auth_header)
    # Check if admin is requesting another user's folders
    owner_id_param = request.args.get('owner_id')
    
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "DB"}), 500
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    # Check role
    cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
    u = cursor.fetchone()
    is_admin = u and u['role'] == 'admin'
    
    target_user = user_id
    if is_admin and owner_id_param:
        target_user = owner_id_param

    cursor.execute(
        "SELECT folder_id AS id, foldername AS name, color, created_at AS created_at FROM folders WHERE created_by = %s",
        (target_user,)
    )
    folders = cursor.fetchall()
    cursor.close()
    conn.close()

    formatted = [{"id": str(f['id']), "name": f['name'], "color": f['color'], "created_at": f['created_at']} for f in folders]
    return jsonify({"status": "success", "data": formatted}), 200


@app.route('/api/folders', methods=['POST'])
def create_folder():
    auth_header = request.headers.get('Authorization')
    if not auth_header: return jsonify({"status": "error", "message": "Unauthorized"}), 401
    user_id = int(auth_header)
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
    auth_header = request.headers.get('Authorization')
    if not auth_header: return jsonify({"status": "error", "message": "Unauthorized"}), 401
    user_id = int(auth_header)
    folder_id = request.args.get('folder_id')
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
    u = cursor.fetchone()
    is_admin = u and u['role'] == 'admin'

    base_sql = (
        "SELECT f.file_id AS id, f.filename AS name, f.filetype AS type, f.filesize AS size, "
        "f.uploaddate AS date_raw, f.icon, u2.username as owner_name "
        "FROM files f "
        "LEFT JOIN users u2 ON f.owner_id = u2.user_id"
    )

    if is_admin:
        if folder_id and folder_id != 'undefined':
            cursor.execute(base_sql + " WHERE f.folder_id = %s ORDER BY f.uploaddate DESC", (folder_id,))
        else:
            cursor.execute(base_sql + " ORDER BY f.uploaddate DESC")
    else:
        # Handle filters (like 'recent' for last 24h)
        filter_type = request.args.get('filter')
        limit = request.args.get('limit')
        
        where_clauses = ["f.owner_id = %s"]
        params = [user_id]
        
        if folder_id and folder_id != 'undefined':
            where_clauses.append("f.folder_id = %s")
            params.append(folder_id)
            
        if filter_type == 'recent':
            where_clauses.append("f.uploaddate >= DATE_SUB(NOW(), INTERVAL 1 DAY)")

        sql = base_sql + " WHERE " + " AND ".join(where_clauses) + " ORDER BY f.uploaddate DESC"
        if limit and limit.isdigit():
            sql += f" LIMIT {int(limit)}"
            
        cursor.execute(sql, tuple(params))

    files = cursor.fetchall()
    for f in files:
        f['id'] = str(f['id'])
        raw = f.pop('date_raw', None)
        f['date_modified'] = raw.strftime('%b %d, %Y') if raw else '-'
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

    # Read the file bytes before saving - needed for DB BLOB storage
    file_bytes = file.read()
    file.seek(0)

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO files (filename, filetype, filesize, icon, folder_id, owner_id, file_data) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (file.filename, type_str, size_str, icon_str, folder_id, user_id, file_bytes)
    )
    new_file_id = cursor.lastrowid

    # Also attempt to save physically (local dev / if disk persists)
    try:
        filename = secure_filename(file.filename)
        if not filename:
            filename = "unnamed_file"
        save_path = os.path.join(UPLOAD_FOLDER, f"{new_file_id}_{filename}")
        with open(save_path, 'wb') as fout:
            fout.write(file_bytes)
    except Exception as e:
        print(f"Filesystem save skipped (OK on Render): {e}")

    cursor.execute(
        "INSERT INTO activity_log (user_id, action, file_id, action_desc, action_icon) VALUES (%s, %s, %s, %s, %s)",
        (user_id, 'uploaded', new_file_id, file.filename, 'upload')
    )

    # Update storage usage
    size_gb = size_bytes / (1024 * 1024 * 1024)
    cursor.execute(
        "UPDATE users SET storage_used_gb = storage_used_gb + %s WHERE user_id = %s",
        (size_gb, user_id)
    )

    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "File uploaded."}), 201

@app.route('/api/files/download/<int:file_id>', methods=['GET'])
def download_file(file_id):
    user_id = int(request.args.get('uid', 1))
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
    u = cursor.fetchone()
    is_admin = u and u['role'] == 'admin'

    cursor.execute("SELECT filename, owner_id, file_data FROM files WHERE file_id = %s", (file_id,))
    f = cursor.fetchone()
    
    if not f:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "File not found"}), 404
        
    cursor.execute("SELECT 1 FROM access_control WHERE file_id = %s AND user_id = %s", (file_id, user_id))
    has_access = cursor.fetchone()

    cursor.close()
    conn.close()

    if not is_admin and f['owner_id'] != user_id and not has_access:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    orig_filename = f['filename']
    filename = secure_filename(orig_filename)
    if not filename:
        filename = "unnamed_file"

    import mimetypes
    mime_type, _ = mimetypes.guess_type(filename)

    # Decide inline vs attachment
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    blocked_inline_exts = {
        'sql', 'py', 'js', 'sh', 'bat', 'cmd', 'ps1',
        'rb', 'php', 'pl', 'html', 'htm', 'xml', 'json',
        'env', 'ini', 'cfg', 'conf', 'yaml', 'yml', 'toml'
    }
    safe_inline_types = {
        'application/pdf',
        'image/jpeg', 'image/png', 'image/gif',
        'image/webp', 'image/svg+xml', 'image/bmp',
        'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/wav', 'audio/ogg'
    }
    is_safe_inline = mime_type in safe_inline_types and ext not in blocked_inline_exts

    # -- PRIMARY: serve from DB BLOB (works on Render after restart) ----------
    file_data = f.get('file_data')
    if file_data:
        from flask import Response
        data = bytes(file_data) if not isinstance(file_data, (bytes, bytearray)) else file_data
        response = Response(
            data,
            mimetype=mime_type or 'application/octet-stream'
        )
        if is_safe_inline:
            response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        else:
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    # -- FALLBACK: try filesystem (legacy files / local dev) ------------------
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{filename}")
    if os.path.exists(file_path):
        if is_safe_inline:
            from flask import Response
            with open(file_path, 'rb') as fh:
                data = fh.read()
            response = Response(data, mimetype=mime_type)
            response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        else:
            return send_from_directory(UPLOAD_FOLDER, f"{file_id}_{filename}",
                                       as_attachment=True, download_name=filename)

    # -- NEITHER source available ---------------------------------------------
    return f"""
    <!DOCTYPE html><html><head><title>File Not Available</title>
    <style>
      body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
           height:100vh;margin:0;background:#1a1f2e;color:#ccc}}
      .box{{text-align:center;padding:40px;background:#243046;border-radius:16px;border:1px solid #3a4a6a}}
      h2{{color:#e74c3c;margin-bottom:12px}} p{{font-size:0.95rem;opacity:0.75}}
    </style></head>
    <body><div class="box"><h2>&#x26A0; File Not Available</h2>
    <p>The file <strong>{orig_filename}</strong> was uploaded before persistent storage was enabled.</p>
    <p style="margin-top:16px;font-size:0.8rem;">Please delete this entry and re-upload the file.</p>
    </div></body></html>
    """, 404


@app.route('/api/files/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
    u = cursor.fetchone()
    is_admin = u and u['role'] == 'admin'

    if is_admin:
        cursor.execute("SELECT filename, filesize, owner_id FROM files WHERE file_id = %s", (file_id,))
    else:
        cursor.execute("SELECT filename, filesize, owner_id FROM files WHERE file_id = %s AND owner_id = %s", (file_id, user_id))
        
    f = cursor.fetchone()
    if not f:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "File not found or unauthorized to delete"}), 404

    # Calculate and subtract storage from the owner
    size_str = f['filesize']
    size_gb = 0
    try:
        parts = size_str.split()
        if len(parts) == 2:
            val, unit = float(parts[0]), parts[1].upper()
            if unit == 'GB': size_gb = val
            elif unit == 'MB': size_gb = val / 1024
            elif unit == 'KB': size_gb = val / (1024 * 1024)
            elif unit == 'B': size_gb = val / (1024 * 1024 * 1024)
    except Exception:
        pass

    if size_gb > 0:
        cursor.execute("UPDATE users SET storage_used_gb = GREATEST(0.00, storage_used_gb - %s) WHERE user_id = %s", (size_gb, f['owner_id']))

    cursor.execute("DELETE FROM files WHERE file_id = %s", (file_id,))
    
    # Try deleting the physical file
    try:
        filename = secure_filename(f['filename'])
        if not filename:
            filename = "unnamed_file"
        file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{filename}")
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Error removing physical file: {e}")
        
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user_id, 'deleted file', f['filename'], 'trash')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "File deleted."}), 200

# ---------------------------------------------------------
# ACCESS CONTROL  (uses: access_control - access_id, user_id, file_id, permission)
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
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
    u = cursor.fetchone()
    if not u:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    
    role = u['role']
    
    base_sql = """
        SELECT
            a.log_id AS id,
            us.username AS user_name,
            a.action,
            COALESCE(f.filename, a.action_desc, '-') AS target,
            a.action_icon AS icon,
            CASE
              WHEN TIMESTAMPDIFF(MINUTE, a.action_time, NOW()) < 60
                THEN CONCAT(TIMESTAMPDIFF(MINUTE, a.action_time, NOW()), ' mins ago')
              WHEN TIMESTAMPDIFF(HOUR, a.action_time, NOW()) < 24
                THEN CONCAT(TIMESTAMPDIFF(HOUR, a.action_time, NOW()), ' hours ago')
              ELSE CONCAT(TIMESTAMPDIFF(DAY, a.action_time, NOW()), ' days ago')
            END AS time_ago
        FROM activity_log a
        JOIN users us ON a.user_id = us.user_id
        LEFT JOIN files f ON a.file_id = f.file_id
    """
    
    if role == 'admin':
        cursor.execute(base_sql + " ORDER BY a.action_time DESC LIMIT 10")
    else:
        cursor.execute(base_sql + " WHERE a.user_id = %s ORDER BY a.action_time DESC LIMIT 10", (user_id,))

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
            cursor.close()
            conn.close()
            return jsonify({"status": "already_accepted", "message": "you already have an access"}), 200
        else:
            name_parts = data['name'].strip().split()
            fname = name_parts[0]
            lname = name_parts[-1] if len(name_parts) > 1 else 'User'
            username = data['email'].split('@')[0]
            cursor.execute(
                "INSERT INTO users (username, fname, lname, email, password_hash, role, storage_total_gb) "
                "VALUES (%s, %s, %s, %s, %s, 'user', 1.0)",
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
# ADMIN - PENDING REQUESTS
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
    try:
        # 1. Fetch user by email
        cursor.execute("SELECT user_id, password_hash, role FROM users WHERE email = %s", (data['email'].lower().strip(),))
        user = cursor.fetchone()

        if not user:
            return jsonify({"status": "error", "message": "No account found with this email"}), 401
            
        if user['role'] == 'admin':
            return jsonify({"status": "error", "message": "Admins must use the administrator portal"}), 403

        # 2. Verify password (matching current system logic of plain-text comparison)
        if data['password'] != user['password_hash']:
            return jsonify({"status": "error", "message": "Incorrect password"}), 401

        # 3. Check for initial 'Access' approval status
        # Only block if their most recent Access-type request is pending or rejected
        cursor.execute("""
            SELECT status FROM user_requests 
            WHERE user_id = %s 
            AND (request_type LIKE '%%Access%%' OR request_type = 'General Access')
            ORDER BY created_at DESC LIMIT 1
        """, (user['user_id'],))
        access_request = cursor.fetchone()

        if access_request:
            status = access_request['status']
            if status == 'pending':
                return jsonify({"status": "error", "message": "Your access request is currently pending admin approval."}), 403
            elif status == 'rejected':
                return jsonify({"status": "error", "message": "Your access request was rejected by an administrator."}), 403

        # 4. Successful login activity logging
        cursor.execute(
            "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
            (user['user_id'], 'logged in', 'User portal', 'right-to-bracket')
        )
        conn.commit()
        return jsonify({"status": "success", "data": {"user_id": user['user_id']}}), 200

    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"status": "error", "message": "An internal server error occurred during login."}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/requests', methods=['GET'])
def get_user_requests():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role, email FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()
    
    admin_emails = ['anushakpramod24@gmail.com', 'vishnupriyapt29@gmail.com']
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
    
    admin_emails = ['anushakpramod24@gmail.com', 'vishnupriyapt29@gmail.com']
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
        

    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": f"Request {new_status}."}), 200


# ---------------------------------------------------------
# ADMIN - GLOBAL FILE MANAGER  (all files across all users)
# ---------------------------------------------------------

@app.route('/api/admin/files', methods=['GET'])
def admin_get_all_files():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role, email FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()

    admin_emails = ['anushakpramod24@gmail.com', 'vishnupriyapt29@gmail.com']
    if not user or user['role'] != 'admin' or user['email'] not in admin_emails:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    owner_filter = request.args.get('owner_id')
    search_q     = request.args.get('q', '').strip()

    sql = (
        "SELECT f.file_id AS id, f.filename AS name, f.filetype AS type, "
        "f.filesize AS size, f.uploaddate AS date_raw, f.icon, "
        "u.user_id AS owner_id, u.username AS owner_name "
        "FROM files f "
        "LEFT JOIN users u ON f.owner_id = u.user_id"
    )
    conditions = []
    params = []

    if owner_filter and owner_filter != 'all':
        conditions.append("f.owner_id = %s")
        params.append(owner_filter)
    if search_q:
        conditions.append("f.filename LIKE %s")
        params.append(f"%{search_q}%")

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY f.uploaddate DESC"
    cursor.execute(sql, params)
    files = cursor.fetchall()

    for f in files:
        f['id'] = str(f['id'])
        raw = f.pop('date_raw', None)
        f['date_modified'] = raw.strftime('%b %d, %Y') if raw else '-'

    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": files}), 200

# ---------------------------------------------------------
# RENAME AND DELETE FOLDERS
# ---------------------------------------------------------

@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    
    # Verify owner
    cursor.execute("SELECT foldername, created_by FROM folders WHERE folder_id = %s", (folder_id,))
    folder = cursor.fetchone()
    if not folder:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Folder not found"}), 404
    
    if folder['created_by'] != user_id:
        cursor.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
        u = cursor.fetchone()
        if not u or u['role'] != 'admin':
            cursor.close()
            conn.close()
            return jsonify({"status": "error", "message": "Unauthorized"}), 403

    cursor.execute("DELETE FROM folders WHERE folder_id = %s", (folder_id,))
    
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user_id, 'deleted folder', folder['foldername'], 'trash')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Folder deleted."}), 200


@app.route('/api/folders/<int:folder_id>', methods=['PUT'])
def rename_folder(folder_id):
    user_id = int(request.headers.get('Authorization', 1) or 1)
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"status": "error", "message": "Invalid request"}), 400

    new_name = data['name'].strip()
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT created_by FROM folders WHERE folder_id = %s", (folder_id,))
    folder = cursor.fetchone()
    if not folder or folder['created_by'] != user_id:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized or not found"}), 403

    cursor.execute("UPDATE folders SET foldername = %s WHERE folder_id = %s", (new_name, folder_id))
    
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user_id, 'renamed folder', new_name, 'pen')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Folder renamed."}), 200

# ---------------------------------------------------------
# UPDATE LOGOUT ROUTE FOR ACTIVITY LOGGING
# ---------------------------------------------------------

@app.route('/api/user/logout', methods=['POST'])
def user_logout():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO activity_log (user_id, action, action_desc, action_icon) VALUES (%s, %s, %s, %s)",
        (user_id, 'logged out', 'system', 'right-from-bracket')
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Logged out."}), 200



@app.route('/api/admin/users-list', methods=['GET'])
def admin_list_users():
    user_id = int(request.headers.get('Authorization', 1) or 1)
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500

    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT role, email FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()

    admin_emails = ['anushakpramod24@gmail.com', 'vishnupriyapt29@gmail.com']
    if not user or user['role'] != 'admin' or user['email'] not in admin_emails:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    cursor.execute(
        "SELECT user_id AS id, username AS name, "
        "(SELECT COUNT(*) FROM files WHERE owner_id = users.user_id) AS file_count "
        "FROM users WHERE role = 'user' ORDER BY username ASC"
    )
    users = cursor.fetchall()
    for u in users:
        u['id'] = str(u['id'])
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": users}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

