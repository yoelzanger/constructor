# Hebrew RTL Support
try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAS_RTL_SUPPORT = True
except ImportError:
    HAS_RTL_SUPPORT = False
    print("Warning: python-bidi or arabic-reshaper not found. Hebrew titles may look wrong.")

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import sqlite3
import pandas as pd
import os
from datetime import datetime

# Connect to DB
db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

# STATUS MAPPING (Consistent with progress_analysis.py)
STATUS_MAP = {
    'COMPLETED': 'OK',
    'COMPLETED_OK': 'OK',
    'DEFECT': 'DEFECT',
    'NOT_OK': 'DEFECT',
    'IN_PROGRESS': 'PENDING',
    'PENDING': 'PENDING',
}

def generate_defect_history_chart(apt_num):
    print(f"Generating Defect Handling History for Apartment {apt_num}...")
    
    # 1. Data Extraction
    query = f"""
    SELECT 
        r.reportDate,
        a.number as apartment_number,
        wi.category,
        wi.status,
        wi.location,
        wi.description
    FROM WorkItem wi
    JOIN Report r ON wi.reportId = r.id
    JOIN Apartment a ON wi.apartmentId = a.id
    WHERE a.number = '{apt_num}'
    AND (r.hasErrors = 0 OR r.hasErrors IS NULL)
    ORDER BY r.reportDate ASC
    """
    
    df = pd.read_sql_query(query, conn)
    
    if df.empty:
        print(f"No data found for Apartment {apt_num}")
        return

    df['reportDate'] = pd.to_datetime(df['reportDate'], unit='ms')

    # 2. Categorize Status
    df['state'] = df['status'].map(STATUS_MAP).fillna('INFO')
    
    # Logic Update:
    # 1. User specified: "omitted from following report: i.e. also fixed"
    #    This implies we should treat each report as a SNAPSHOT of pending defects.
    #    We do NOT carry forward defects from previous reports if they are missing.
    # 2. Uniqueness: Defects are distinct by (Category, Location, Description).
    #    Previous logic aggregated by (Category, Location) which collapsed multiple defects.
    
    df['location'] = df['location'].fillna('General')
    df['description'] = df['description'].fillna('')
    
    # Identify defects in each report
    # We filter for items that are legally 'DEFECT' in that specific report.
    defects_only = df[df['state'] == 'DEFECT'].copy()
    
    # Count defects per Report and Category
    # Group by reportDate and category
    # We assume items within a single report are unique by ID (database row).
    # But just in case of duplicates in the join/extract (unlikely), we count rows.
    
    history_counts = defects_only.groupby(['reportDate', 'category']).size().reset_index(name='pending_defects')
    
    # Ensure all report dates are represented for all categories (fill with 0 where 0 defects)
    report_dates = sorted(df['reportDate'].unique())
    categories = sorted(df['category'].unique())
    
    # Build complete index
    full_index = pd.MultiIndex.from_product([report_dates, categories], names=['reportDate', 'category'])
    df_history = history_counts.set_index(['reportDate', 'category']).reindex(full_index, fill_value=0).reset_index()

    # 3. Visualization
    plt.figure(figsize=(12, 6))
    
    has_data = False
    for category in categories:
        cat_data = df_history[df_history['category'] == category]
        
        # Only plot if there's significant activity or at least one defect ever
        if cat_data['pending_defects'].sum() > 0: 
             plt.plot(cat_data['reportDate'], cat_data['pending_defects'], marker='o', label=category, linewidth=2)
             has_data = True
             
    if not has_data:
        print(f"No defects found for Apartment {apt_num} in any category (with 'DEFECT' status).")
    
    title_text = f"היסטוריית טיפול בליקויים - דירה {apt_num}"
    
    if HAS_RTL_SUPPORT:
        reshaped_text = arabic_reshaper.reshape(title_text)
        title_text = get_display(reshaped_text)
        
    plt.title(title_text, fontsize=16, fontweight='bold')
    plt.xlabel('Date')
    plt.ylabel('Pending Defects')
    plt.grid(True, linestyle='--', alpha=0.3)
    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.tight_layout()
    plt.gcf().autofmt_xdate()

    # Save
    output_dir = 'chart_output'
    os.makedirs(output_dir, exist_ok=True)
    filename = os.path.join(output_dir, f'defect_history_apt_{apt_num}.png')
    plt.savefig(filename, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Chart saved to: {filename}")
    
    # Text summary for specific interesting dates (like October 2025)
    print("\n--- Summary of Defects in Late 2025 ---")
    mask_2025 = (df_history['reportDate'].dt.year == 2025) & (df_history['reportDate'].dt.month >= 9)
    late_2025 = df_history[mask_2025]
    nonzero = late_2025[late_2025['pending_defects'] > 0]
    if not nonzero.empty:
        print(nonzero)
    else:
        print("No defects found in Late 2025.")

if __name__ == "__main__":
    # Get all unique apartment numbers
    query_apts = "SELECT DISTINCT number FROM Apartment ORDER BY number"
    df_apts = pd.read_sql_query(query_apts, conn)
    
    if not df_apts.empty:
        print(f"Found {len(df_apts)} apartments. Generating charts...")
        for apt_num in df_apts['number']:
            try:
                generate_defect_history_chart(str(apt_num))
            except Exception as e:
                print(f"Error generating chart for Apt {apt_num}: {e}")
    else:
        print("No apartments found in database.")
        
    conn.close()
