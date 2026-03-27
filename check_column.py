import os, pymysql
db_host = os.environ.get('DB_HOST', 'localhost')
db_port = int(os.environ.get('DB_PORT', 3306))
if ':' in db_host and db_host.count(':') == 1:
    h, p = db_host.split(':'); db_host = h; db_port = int(p)
conn = pymysql.connect(host=db_host, user=os.environ.get('DB_USER','root'),
    password=os.environ.get('DB_PASSWORD','password'),
    database=os.environ.get('DB_NAME','cloudhub'), port=db_port, connect_timeout=10)
cur = conn.cursor()
cur.execute("SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='files'")
rows = cur.fetchall()
print("Columns in 'files' table:")
for r in rows:
    print(" ", r[0], "-", r[1])
cur.close(); conn.close()
