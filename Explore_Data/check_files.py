import os

files = [
    r"c:\Users\yoel\constructor\dump_hex_jan2026.txt",
    r"c:\Users\yoel\constructor\dump_hex_jan2026_v2.txt",
    r"c:\Users\yoel\constructor\dump_hex_jan2026_v3.txt",
    r"c:\Users\yoel\constructor\data\jan2026_data.txt",
    r"c:\Users\yoel\constructor\data\id_map_sept17.txt",
]

for f in files:
    print(f"\nChecking {f}...")
    if os.path.exists(f):
        size = os.path.getsize(f)
        print(f"  Exists, size: {size} bytes")
        
        # Try to read and search for "Apartment 7" or "Apt 7"
        found = False
        try:
            # Try utf-8 first
            with open(f, 'r', encoding='utf-8') as file:
                content = file.read()
                if "Apartment 7" in content or "Apt 7" in content or "7" in content: # '7' is weak but let's see
                    print(f"  Found keyword in utf-8 read.")
                    found = True
        except:
            try:
                # Try utf-16le
                with open(f, 'r', encoding='utf-16-le') as file:
                    content = file.read()
                    if "Apartment 7" in content or "Apt 7" in content:
                        print(f"  Found keyword in utf-16-le read.")
                        found = True
            except Exception as e:
                print(f"  Error reading: {e}")
                
        if found:
            print("  Likely relevant.")
    else:
        print("  Does NOT exist.")
