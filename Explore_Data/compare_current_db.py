import sqlite3
import pandas as pd

# Connect to DB
db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

# Query to get status counts for Apt 7
query = """
    SELECT 
        w.status,
        COUNT(*) as count
    FROM WorkItem w
    JOIN Apartment a ON w.apartmentId = a.id
    WHERE a.number = '7'
    GROUP BY w.status
"""

try:
    df = pd.read_sql_query(query, conn)
    print("--- Current Database Values for Apartment 7 ---")
    print(df)
    
    # Calculate totals
    total_completed = df[df['status'] == 'COMPLETED']['count'].sum()
    total_defects = df[df['status'] == 'DEFECT']['count'].sum()
    total_in_process = df[df['status'] == 'IN_PROGRESS']['count'].sum()
    
    print(f"\nTotal Completed: {total_completed}")
    print(f"Total Defects: {total_defects}")
    print(f"Total In Process: {total_in_process}")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
