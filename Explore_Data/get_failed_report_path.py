import sqlite3
import pandas as pd

db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

# Get info for report from Dec 3, 2025
query = """
    SELECT id, fileName, filePath, reportDate, hasErrors, errorDetails 
    FROM Report 
    WHERE reportDate >= 1764720000000 AND reportDate <= 1764806400000
""" 
# Dec 3 2025 is approx 17647... wait, let's use string match for safety if timestamp is fuzzy
query_alt = """
    SELECT id, fileName, filePath, reportDate, hasErrors, errorDetails 
    FROM Report 
    WHERE fileName LIKE '%2025-12-03%' OR fileName LIKE '%3.12.25%'
"""

print("--- Searching for Dec 3 2025 Report ---")
df = pd.read_sql_query(query_alt, conn)
print(df)

if not df.empty:
    print(f"\nFile Path: {df.iloc[0]['filePath']}")

conn.close()
