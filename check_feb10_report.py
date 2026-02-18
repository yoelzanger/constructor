import sqlite3
import pandas as pd

db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

query = """
    SELECT id, fileName, reportDate, processed, hasErrors, errorDetails, rawExtraction
    FROM Report 
    WHERE fileName LIKE '%2026-02-10%' OR fileName LIKE '%10.2.26%' OR fileName LIKE '%10.02.26%'
"""

print("--- Searching for Feb 10 2026 Report ---")
df = pd.read_sql_query(query, conn)
print(df)

if not df.empty:
    r_id = df.iloc[0]['id']
    print(f"\n--- Checking items for report {r_id} ---")
    query_items = f"SELECT COUNT(*) as count FROM WorkItem WHERE reportId = '{r_id}'"
    count = pd.read_sql_query(query_items, conn).iloc[0]['count']
    print(f"Total Items: {count}")

conn.close()
