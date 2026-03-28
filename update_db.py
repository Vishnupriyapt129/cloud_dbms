import pymysql
import os

def upgrade_db():
    db_host = os.environ.get('DB_HOST', 'localhost')
    db_port = int(os.environ.get('DB_PORT', 3306))
    if ':' in db_host and db_host.count(':') == 1:
        db_host, port_str = db_host.split(':')
        db_port = int(port_str)

    try:
        db = pymysql.connect(
            host=db_host,
            port=db_port,
            user=os.environ.get('DB_USER', 'root'),
            password=os.environ.get('DB_PASSWORD', 'password'),
            database=os.environ.get('DB_NAME', 'cloudhub')
        )
        cursor = db.cursor()
        print("Adding is_public column to files table...")
        cursor.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE")
        db.commit()
        print("Success!")
    except Exception as e:
        if "Duplicate column name" in str(e) or "1064" in str(e):
            print("Column may already exist, bypassing: " + str(e))
            try:
                cursor.execute("ALTER TABLE files ADD COLUMN is_public BOOLEAN DEFAULT FALSE")
                db.commit()
                print("Fallback success!")
            except Exception as e2:
                print("Column definitely exists or other error: " + str(e2))
        else:
            print("Error: ", e)

if __name__ == "__main__":
    upgrade_db()
