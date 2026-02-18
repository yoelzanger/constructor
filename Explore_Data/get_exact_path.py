import sqlite3
import pandas as pd

db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

query_alt = """
    SELECT filePath
    FROM Report 
    WHERE fileName LIKE '%2025-12-03%' OR fileName LIKE '%3.12.25%'
"""

print("--- Searching for Dec 3 2025 Report Path ---")
cursor = conn.cursor()
cursor.execute(query_alt)
row = cursor.fetchone()

if row:
    print(f"PATH: {row[0]}")
else:
    print("Report not found")

conn.close()
