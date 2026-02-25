import sqlite3
conn = sqlite3.connect('prisma/dev.db')
conn.execute("""
CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activityType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "city" TEXT,
    "details" TEXT
)
""")
conn.execute('CREATE INDEX IF NOT EXISTS "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp")')
conn.commit()
conn.close()
print('ActivityLog table created successfully')
