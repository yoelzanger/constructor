import sqlite3
import pandas as pd

# Connect to DB
db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

# Dates to check (approximate timestamps or strings)
# User mentioned: 2025-10-21, 2025-11-06, 2025-11-19, 2025-12-03, 2025-12-23, 2026-01-11
# Let's get all reports from Oct 2025 onwards
query_reports = """
    SELECT id, reportDate, fileName 
    FROM Report 
    WHERE reportDate >= 1759276800000 
    ORDER BY reportDate
"""
# 1759276800000 is approx Oct 1 2025

print("--- Reports from Oct 2025 Onwards ---")
reports = pd.read_sql_query(query_reports, conn)
reports['reportDate_dt'] = pd.to_datetime(reports['reportDate'], unit='ms')
print(reports[['reportDate_dt', 'fileName', 'id']])

# Now for each report, count items and defects
print("\n--- Item Counts per Report ---")
for _, row in reports.iterrows():
    r_id = row['id']
    date_str = row['reportDate_dt'].strftime('%Y-%m-%d')
    
    query_items = f"""
        SELECT status, COUNT(*) as count
        FROM WorkItem
        WHERE reportId = '{r_id}'
        GROUP BY status
    """
    items_df = pd.read_sql_query(query_items, conn)
    
    total = items_df['count'].sum()
    defects = items_df[items_df['status'] == 'DEFECT']['count'].sum()
    
    print(f"Report: {date_str} - Total: {total}, Defects: {defects}")
    if defects == 0 and total > 0:
        print(f"  [ZERO DEFECTS] Checking sample items...")
        # Get sample items
        q_sample = f"SELECT category, description, status, notes FROM WorkItem WHERE reportId = '{r_id}' LIMIT 5"
        sample = pd.read_sql_query(q_sample, conn)
        for _, s_row in sample.iterrows():
            print(f"    - [{s_row['status']}] {s_row['description'][:50]}... (Notes: {s_row['notes']})")

conn.close()
