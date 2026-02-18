
import fs from 'fs';
import path from 'path';
import { processReport } from '@/lib/report-processing';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

async function run() {
    const filePath = String.raw`c:\Users\yoel\constructor\data\pdfs\2025-12-03 - מוסינזון 5 תל אביב.pdf`;

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    console.log(`Reading file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);

    try {
        console.log('Starting processing (Integration Test)...');
        // Mock project ID 
        const projectId = "dummy-project-id";
        const fileName = path.basename(filePath);

        // Note: This might try to write to DB. If it fails due to DB constraints (like project ID), 
        // we'll catch it. We mostly want to see the LOGS about extraction and heuristic.

        try {
            const result = await processReport(buffer, fileName, projectId, filePath);
            console.log('Processing Result:', JSON.stringify(result, null, 2));
        } catch (e: any) {
            console.log("Process threw error (likely DB related):", e.message);
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

run();
