import os

files = [
    r"c:\Users\yoel\constructor\dump_hex_jan2026.txt",
]

for f in files:
    print(f"\n--- Reading {f} ---")
    if os.path.exists(f):
        try:
            with open(f, 'r', encoding='utf-16-le') as file:
                print(file.read())
        except Exception as e:
            print(f"Error: {e}")
