import os

file_path = r"c:\Users\yoel\constructor\repro.log"

print(f"--- Reading {file_path} ---")
if os.path.exists(file_path):
    try:
        with open(file_path, 'r', encoding='utf-16-le') as f:
            print(f.read())
    except:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                print(f.read())
        except Exception as e:
            print(f"Error: {e}")
else:
    print("File not found")
