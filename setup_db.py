import pymysql
from pymysql.constants import CLIENT
import os

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'password',
    'connect_timeout': 5,
    'client_flag': CLIENT.MULTI_STATEMENTS
}

print("Attempting to securely connect to local environment via PyMySQL...")
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
