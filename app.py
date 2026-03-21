from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from datetime import datetime
import pymysql
import pymysql.cursors

app = Flask(__name__, template_folder='frontend', static_folder='frontend', static_url_path='')
CORS(app)

@app.errorhandler(Exception)
def handle_exception(e):
    if hasattr(e, 'code'):
        return jsonify({"status": "error", "message": str(e)}), e.code
    return jsonify({"status": "error", "message": f"Global Flask Crash: {str(e)}"}), 500

# ---------------------------------------------------------
# MySQL DATABASE CONFIGURATION (PyMySQL)
# ---------------------------------------------------------
DB_CONFIG = {
    'host': 'localhost', # Changed to localhost to prevent hard IP dropping on windows
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
# API ROUTES
# ---------------------------------------------------------

@app.route('/')
def root():
    return render_template('login.html')

@app.route('/login.html')
def login():
    return render_template('login.html')

@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/api/user', methods=['GET'])
def get_user_profile():
    user_id = 1
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "Database connection failed"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT id, name, email, storage_used_gb, storage_total_gb FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if user:
        user_data = {
            "id": str(user['id']),
            "name": user['name'],
            "avatar_url": "",
            "storage": {
                "used_gb": float(user['storage_used_gb']),
                "total_gb": float(user['storage_total_gb']),
                "percentage": (float(user['storage_used_gb']) / float(user['storage_total_gb'])) * 100
            }
        }
        return jsonify({"status": "success", "data": user_data}), 200
    return jsonify({"status": "error", "message": "User not found"}), 404

@app.route('/api/folders', methods=['GET'])
def get_folders():
    user_id = 1
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT id, name, color FROM folders WHERE owner_id = %s", (user_id,))
    folders = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    formatted_folders = [{"id": str(f['id']), "name": f['name'], "color": f['color']} for f in folders]
    return jsonify({"status": "success", "data": formatted_folders}), 200

@app.route('/api/folders', methods=['POST'])
def create_folder():
    user_id = 1
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"status": "error", "message": "Invalid payload."}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor()
    cursor.execute("INSERT INTO folders (name, owner_id) VALUES (%s, %s)", (data['name'], user_id))
    cursor.execute("INSERT INTO activity_log (user_id, action, target, icon) VALUES (%s, %s, %s, %s)", 
                  (user_id, 'created folder', data['name'], 'folder'))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Folder created."}), 201

@app.route('/api/files', methods=['GET'])
def get_files():
    user_id = 1
    folder_id = request.args.get('folder_id')
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    if folder_id and folder_id != 'undefined':
        cursor.execute("SELECT id, filename as name, file_type as type, size_str as size, DATE_FORMAT(upload_date, '%%b %%d, %%Y') as date_modified, icon FROM files WHERE owner_id = %s AND folder_id = %s ORDER BY upload_date DESC", (user_id, folder_id))
    else:
        cursor.execute("SELECT id, filename as name, file_type as type, size_str as size, DATE_FORMAT(upload_date, '%%b %%d, %%Y') as date_modified, icon FROM files WHERE owner_id = %s ORDER BY upload_date DESC", (user_id,))
        
    files = cursor.fetchall()
    for f in files:
        f['id'] = str(f['id'])
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": files}), 200

@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    user_id = 1
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
    cursor.execute("""
        INSERT INTO files (filename, file_type, size_str, icon, folder_id, owner_id)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (file.filename, type_str, size_str, icon_str, folder_id, user_id))
    cursor.execute("INSERT INTO activity_log (user_id, action, target, icon) VALUES (%s, %s, %s, %s)", 
                  (user_id, 'uploaded', file.filename, 'upload'))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "File uploaded."}), 201

@app.route('/api/access-control/<file_id>', methods=['GET'])
def get_access_control(file_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT filename FROM files WHERE id = %s", (file_id,))
    file_info = cursor.fetchone()
    file_name = file_info['filename'] if file_info else "Unknown File"
    
    cursor.execute("""
        SELECT fa.user_id as id, u.name, fa.role 
        FROM file_access fa JOIN users u ON fa.user_id = u.id WHERE fa.file_id = %s
    """, (file_id,))
    users = cursor.fetchall()
    for u in users:
        u['id'] = str(u['id'])
        u['avatar'] = ""
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": {"file_id": str(file_id), "file_name": file_name, "users": users}}), 200

@app.route('/api/access-control/<file_id>/users', methods=['POST'])
def add_user_access(file_id):
    user_id_operator = 1
    data = request.json
    if not data or 'email' not in data or 'role' not in data:
        return jsonify({"status": "error", "message": "Invalid payload."}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT id FROM users WHERE name = %s OR email = %s LIMIT 1", (data['email'], data['email']))
    target_user = cursor.fetchone()
    
    if not target_user:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "User not found. Try 'Emily', 'Mark', or 'Sarah'"}), 404
        
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO file_access (file_id, user_id, role) VALUES (%s, %s, %s)", 
                      (file_id, target_user['id'], data['role']))
        cursor.execute("INSERT INTO activity_log (user_id, action, target, icon) VALUES (%s, %s, %s, %s)", 
                      (user_id_operator, 'gave access to', data['email'], 'share'))
        conn.commit()
    except pymysql.IntegrityError:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": "This User already has access to this file!"}), 400
    except Exception as e:
        cursor.close()
        conn.close()
        return jsonify({"status": "error", "message": f"Fatal SQL Execution Error: {str(e)}"}), 500
        
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Access granted."}), 201

@app.route('/api/access-control/<file_id>/users/<user_id>', methods=['DELETE'])
def remove_user_access(file_id, user_id):
    user_id_operator = 1
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor()
    cursor.execute("DELETE FROM file_access WHERE file_id = %s AND user_id = %s", (file_id, user_id))
    if cursor.rowcount > 0:
        cursor.execute("INSERT INTO activity_log (user_id, action, target, icon) VALUES (%s, %s, %s, %s)", 
                      (user_id_operator, 'removed access', 'user', 'trash'))
        conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Access removed."}), 200

@app.route('/api/activity', methods=['GET'])
def get_activity_logs():
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "message": "DB Error"}), 500
        
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("""
        SELECT a.id, u.name as user_name, a.action, a.target, a.icon, 
               CASE 
                 WHEN TIMESTAMPDIFF(MINUTE, a.created_at, NOW()) < 60 THEN CONCAT(TIMESTAMPDIFF(MINUTE, a.created_at, NOW()), ' mins ago')
                 WHEN TIMESTAMPDIFF(HOUR, a.created_at, NOW()) < 24 THEN CONCAT(TIMESTAMPDIFF(HOUR, a.created_at, NOW()), ' hours ago')
                 ELSE CONCAT(TIMESTAMPDIFF(DAY, a.created_at, NOW()), ' days ago')
               END as time_ago
        FROM activity_log a JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 10
    """)
    logs = cursor.fetchall()
    
    for l in logs:
        if l['time_ago'] == "0 mins ago":
            l['time_ago'] = "Just now"
        l['id'] = str(l['id'])
        
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": logs}), 200

if __name__ == '__main__':
    # Default 5000 port securely restored because Windows natively aggressively rejects Web Port 80 binding!
    app.run(host='0.0.0.0', port=5000, debug=True)
