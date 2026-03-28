import pymysql
import os

db_host = os.environ.get('DB_HOST', 'localhost')
db_user = os.environ.get('DB_USER', 'root')
db_password = os.environ.get('DB_PASSWORD', 'password')
db_name = os.environ.get('DB_NAME', 'cloudhub')
db_port = int(os.environ.get('DB_PORT', 3306))

try:
    conn = pymysql.connect(host=db_host, user=db_user, password=db_password, database=db_name, port=db_port)
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute('SELECT * FROM activity_log ORDER BY action_time DESC LIMIT 10')
    logs = cursor.fetchall()
    for log in logs:
        print(log)
    conn.close()
except Exception as e:
    print(e)
