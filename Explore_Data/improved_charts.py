# Improved Completion Trajectory Charts
# This file contains the updated logic for both chart options

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import sqlite3
import pandas as pd
import os

# Connect to DB
db_path = r'c:\Users\yoel\constructor\prisma\dev.db'
conn = sqlite3.connect(db_path)

# STATUS MAPPING (from progress_analysis.py)
STATUS_MAP = {
    'COMPLETED': 'OK',
    'COMPLETED_OK': 'OK',
    'DEFECT': 'DEFECT',
    'NOT_OK': 'DEFECT',
    'IN_PROGRESS': 'PENDING',
    'PENDING': 'PENDING',
}

# 1. Data Extraction
query = """
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
WHERE wi.apartmentId IS NOT NULL
AND (r.hasErrors = 0 OR r.hasErrors IS NULL)
ORDER BY r.reportDate ASC
"""

df_progress = pd.read_sql_query(query, conn)
df_progress['reportDate'] = pd.to_datetime(df_progress['reportDate'], unit='ms')

# 2. Categorize Status
df_progress['state'] = df_progress['status'].map(STATUS_MAP).fillna('INFO')
df_progress = df_progress[df_progress['state'] != 'INFO'].copy()

# 3. Implement Snapshot Logic (like defect_history_chart.py)
# For each report date, we count items with their state AT THAT REPORT
# Unique items are identified by (apartment, category, location, description)

# Get all unique report dates per apartment
report_dates = df_progress.groupby('apartment_number')['reportDate'].unique()

# Build time series data using snapshot approach
timeseries_data = []

for apt_num in df_progress['apartment_number'].unique():
    apt_data = df_progress[df_progress['apartment_number'] == apt_num]
    dates = sorted(apt_data['reportDate'].unique())
    
    for report_date in dates:
        # Get snapshot of items in this specific report
        report_items = apt_data[apt_data['reportDate'] == report_date]
        
        # Count by category and state
        for category in report_items['category'].unique():
            cat_items = report_items[report_items['category'] == category]
            
            for state in ['OK', 'DEFECT', 'PENDING']:
                count = len(cat_items[cat_items['state'] == state])
                if count > 0:
                    timeseries_data.append({
                        'apartment_number': apt_num,
                        'category': category,
                        'reportDate': report_date,
                        'state': state,
                        'count': count
                    })

df_timeseries = pd.DataFrame(timeseries_data)

# Pivot to get OK, DEFECT, PENDING columns
if not df_timeseries.empty:
    df_pivot = df_timeseries.pivot_table(
        index=['apartment_number', 'category', 'reportDate'],
        columns='state',
        values='count',
        fill_value=0
    ).reset_index()
else:
    # Handle empty case
    df_pivot = pd.DataFrame(columns=['apartment_number', 'category', 'reportDate', 'OK', 'DEFECT', 'PENDING'])

# Ensure all state columns exist
for state in ['OK', 'DEFECT', 'PENDING']:
    if state not in df_pivot.columns:
        df_pivot[state] = 0

# Sort and calculate cumulative sums
df_pivot = df_pivot.sort_values(['apartment_number', 'category', 'reportDate'])

df_pivot['cumulative_ok'] = df_pivot.groupby(['apartment_number', 'category'])['OK'].transform(pd.Series.cumsum)
df_pivot['cumulative_defect'] = df_pivot.groupby(['apartment_number', 'category'])['DEFECT'].transform(pd.Series.cumsum)
df_pivot['cumulative_pending'] = df_pivot.groupby(['apartment_number', 'category'])['PENDING'].transform(pd.Series.cumsum)
df_pivot['cumulative_total'] = df_pivot['cumulative_ok'] + df_pivot['cumulative_defect'] + df_pivot['cumulative_pending']

# Calculate total scope per category (max items seen)
df_scope = df_pivot.groupby(['apartment_number', 'category'])['cumulative_total'].max().reset_index()
df_scope.columns = ['apartment_number', 'category', 'total_scope']

# Merge scope back
df_pivot = df_pivot.merge(df_scope, on=['apartment_number', 'category'])
df_pivot['completion_pct'] = (df_pivot['cumulative_ok'] / df_pivot['total_scope'] * 100).fillna(0)

# 5. Visualization Functions

def plot_multistate_chart(apt_num, df_data):
    """Plot stacked area chart showing OK/DEFECT/PENDING states over time"""
    apt_data = df_data[df_data['apartment_number'] == apt_num]
    categories = sorted(apt_data['category'].unique())
    
    fig, axes = plt.subplots(len(categories), 1, figsize=(14, 4 * len(categories)))
    if len(categories) == 1:
        axes = [axes]
    
    for idx, category in enumerate(categories):
        cat_data = apt_data[apt_data['category'] == category].sort_values('reportDate')
        
        ax = axes[idx]
        
        # Prepare data for stacked area
        dates = cat_data['reportDate']
        ok_vals = cat_data['cumulative_ok']
        defect_vals = cat_data['cumulative_defect']
        pending_vals = cat_data['cumulative_pending']
        
        # Create stacked area
        ax.fill_between(dates, 0, ok_vals, label='OK', color='#4CAF50', alpha=0.7)
        ax.fill_between(dates, ok_vals, ok_vals + defect_vals, label='DEFECT', color='#F44336', alpha=0.7)
        ax.fill_between(dates, ok_vals + defect_vals, ok_vals + defect_vals + pending_vals, 
                        label='PENDING', color='#FFC107', alpha=0.7)
        
        ax.set_title(f'{category} - Multi-State Progress', fontsize=12, fontweight='bold')
        ax.set_xlabel('Date')
        ax.set_ylabel('Item Count (Cumulative)')
        ax.legend(loc='upper left')
        ax.grid(True, linestyle='--', alpha=0.3)
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)
    
    fig.suptitle(f'Apartment {apt_num} - Multi-State Completion Trajectory', 
                 fontsize=16, fontweight='bold', y=0.995)
    plt.tight_layout()
    return fig

def plot_percentage_chart(apt_num, df_data):
    """Plot completion percentage with total scope baseline"""
    apt_data = df_data[df_data['apartment_number'] == apt_num]
    
    plt.figure(figsize=(14, 6))
    ax = plt.gca()
    
    categories = sorted(apt_data['category'].unique())
    
    for category in categories:
        cat_data = apt_data[apt_data['category'] == category].sort_values('reportDate')
        
        ax.plot(cat_data['reportDate'], cat_data['completion_pct'], 
                marker='o', label=category, linewidth=2)
    
    # Add 100% reference line
    ax.axhline(y=100, color='green', linestyle='--', linewidth=1.5, alpha=0.5, label='100% Complete')
    
    ax.set_title(f'Apartment {apt_num} - Completion Percentage', fontsize=14, fontweight='bold')
    ax.set_xlabel('Date')
    ax.set_ylabel('Completion %')
    ax.set_ylim(0, 110)
    ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    ax.grid(True, linestyle='--', alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()
    return plt.gcf()

# 6. Generate Charts for All Apartments
apartments = sorted(df_pivot['apartment_number'].unique())

# Create output directory
output_dir = 'chart_output'
os.makedirs(output_dir, exist_ok=True)

print(f"Generating charts for {len(apartments)} apartments...")
print(f"Saving charts to: {os.path.abspath(output_dir)}")

for apt_num in apartments:
    print(f"\n=== Apartment {apt_num} ===")
    
    # Multi-state chart
    fig1 = plot_multistate_chart(apt_num, df_pivot)
    filename1 = os.path.join(output_dir, f'apt_{apt_num}_multistate.png')
    plt.savefig(filename1, dpi=150, bbox_inches='tight')
    plt.close(fig1)
    print(f"  ✓ Saved multi-state chart: {filename1}")
    
    # Percentage chart
    fig2 = plot_percentage_chart(apt_num, df_pivot)
    filename2 = os.path.join(output_dir, f'apt_{apt_num}_percentage.png')
    plt.savefig(filename2, dpi=150, bbox_inches='tight')
    plt.close(fig2)
    print(f"  ✓ Saved percentage chart: {filename2}")

conn.close()
print(f"\n✅ Chart generation complete! All charts saved to: {os.path.abspath(output_dir)}")
