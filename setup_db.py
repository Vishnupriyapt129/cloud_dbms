import pymysql
from pymysql.constants import CLIENT
import os

db_host = os.environ.get('DB_HOST', 'localhost')
db_port = int(os.environ.get('DB_PORT', 3306))

if ':' in db_host and db_host.count(':') == 1:
    db_host_split, port_str = db_host.split(':')
    db_host = db_host_split
    db_port = int(port_str)

db_ssl_kwargs = {}
if os.environ.get('DB_REQUIRE_SSL', 'false').lower() == 'true':
    import ssl
    db_ssl_kwargs['ssl'] = ssl.create_default_context()

DB_CONFIG = {
    'host': db_host,
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'password'),
    # database connection omitted initially or explicitly set if possible
    'database': os.environ.get('DB_NAME', 'cloudhub'),
    'port': db_port,
    'connect_timeout': 10,
    'client_flag': CLIENT.MULTI_STATEMENTS,
    **db_ssl_kwargs
}

print(f"Attempting to securely connect to {DB_CONFIG['host']}:{DB_CONFIG['port']} via PyMySQL...")
try:
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    print("Successfully connected to MySQL Database Engine! Local credentials confirmed.")
    
    print("Reading your schema.sql layout configuration...")
    if not os.path.exists('schema.sql'):
        print("[!] Cannot find schema.sql in this directory! Make sure it exists.")
        exit(1)
        
    with open('schema.sql', 'r') as f:
        sql_script = f.read()
        
    print("Executing complete CloudHub table creation and data seeding map...")
    
    # Executes safely chunk by chunk to prevent PyMySQL single-statement ingestion bugs
    for statement in sql_script.split(';'):
        if statement.strip():
            cursor.execute(statement)
    conn.commit()
    
    print("\n---------------------------------------------------------")
    print("SUCCESS! The 'cloudhub' DBMS has been completely built and populated.")
    print("You no longer have any database errors! Your system is ready!")
    print("---------------------------------------------------------")
    
except pymysql.MySQLError as err:
    print(f"\n[!] MYSQL SERVER ERROR: {err}")
    print("Double check that your MySQL Server software is actively turned on!")
except Exception as e:
    print(f"\n[!] GENERAL PYTHON ERROR: {e}")
finally:
    if 'cursor' in locals():
        cursor.close()
    if 'conn' in locals() and conn.open:
        conn.close()
