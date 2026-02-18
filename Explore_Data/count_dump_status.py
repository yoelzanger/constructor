import os
import re

files = [
    r"c:\Users\yoel\constructor\dump_hex_jan2026.txt",
    r"c:\Users\yoel\constructor\dump_hex_jan2026_v2.txt",
    r"c:\Users\yoel\constructor\dump_hex_jan2026_v3.txt",
]

for f in files:
    print(f"\n{'='*40}")
    print(f"Analyzing {os.path.basename(f)}")
    print(f"{'='*40}")
    
    if not os.path.exists(f):
        print("File not found.")
        continue
        
    content = ""
    try:
        with open(f, 'rb') as file:
            raw = file.read()
            # Try decoding as utf-16-le
            try:
                content = raw.decode('utf-16-le')
            except:
                print("Failed utf-16-le, trying utf-8 with errors ignore")
                content = raw.decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error reading file: {e}")
        continue

    # Find all "Status: <STATUS>" patterns
    statuses = re.findall(r"Status:\s*([A-Z_]+)", content)
    
    counts = {}
    for s in statuses:
        counts[s] = counts.get(s, 0) + 1
        
    print(f"Total Items Found: {len(statuses)}")
    for s, c in counts.items():
        print(f"{s}: {c}")
        
    # Calculate totals
    completed = counts.get('COMPLETED', 0) + counts.get('COMPLETED_OK', 0)
    defects = counts.get('DEFECT', 0)
    in_process = counts.get('IN_PROGRESS', 0)
    
    print(f"\n--- Summary for {os.path.basename(f)} ---")
    print(f"Completed (incl OK): {completed}")
    print(f"Defects: {defects}")
    print(f"In Process: {in_process}")
