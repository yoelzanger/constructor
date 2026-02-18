import os

files_to_read = [
    (r"c:\Users\yoel\constructor\dump_hex_jan2026.txt", "utf-16-le"),
    (r"c:\Users\yoel\constructor\data\jan2026_data.txt", "utf-8"),
    (r"c:\Users\yoel\constructor\dump_hex_jan2026_v2.txt", "utf-16-le"),
]

for file_path, encoding in files_to_read:
    print(f"\n--- Reading {os.path.basename(file_path)} ---")
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue
        
    try:
        with open(file_path, 'r', encoding=encoding) as f:
            content = f.read()
            print(f"Content length: {len(content)}")
            print(content[:1000]) # Print first 1000 chars
    except UnicodeError:
        print(f"Failed to read with {encoding}, trying default")
        try:
            with open(file_path, 'r') as f:
                content = f.read()
                print(f"Content length: {len(content)}")
                print(content[:1000])
        except Exception as e:
            print(f"Error reading with default: {e}")
    except Exception as e:
        print(f"Error: {e}")
