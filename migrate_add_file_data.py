"""
One-time migration: adds file_data LONGBLOB column to the files table.
Run once: python migrate_add_file_data.py
"""
import os
import pymysql

db_host = os.environ.get('DB_HOST', 'localhost')
db_port = int(os.environ.get('DB_PORT', 3306))

if ':' in db_host and db_host.count(':') == 1:
    db_host, port_str = db_host.split(':')
    db_port = int(port_str)

db_ssl_kwargs = {}
if os.environ.get('DB_REQUIRE_SSL', 'false').lower() == 'true':
    import ssl
    db_ssl_kwargs['ssl'] = ssl.create_default_context()

conn = pymysql.connect(
    host=db_host,
    user=os.environ.get('DB_USER', 'root'),
    password=os.environ.get('DB_PASSWORD', 'password'),
    database=os.environ.get('DB_NAME', 'cloudhub'),
    port=db_port,
    connect_timeout=15,
    **db_ssl_kwargs
)

cursor = conn.cursor()

# Check if column already exists
cursor.execute("""
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'files'
      AND COLUMN_NAME  = 'file_data'
""")
exists = cursor.fetchone()[0]

if exists:
    print("✅ Column 'file_data' already exists — nothing to do.")
else:
    print("Adding 'file_data LONGBLOB' column to files table...")
    cursor.execute("ALTER TABLE files ADD COLUMN file_data LONGBLOB DEFAULT NULL")
    conn.commit()
    print("✅ Migration complete! Column added successfully.")

cursor.close()
conn.close()
