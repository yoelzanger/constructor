
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// @ts-ignore
const pdfLib = require('pdf-parse');
const pdfParse = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;

// Load env vars
dotenv.config();

function reverseHebrew(str: string): string {
    return str.split('').reverse().join('');
}

// --- Heuristic ---
async function checkForApartmentData(buffer: Buffer): Promise<boolean> {
    try {
        const parsed = await pdfParse(buffer);
        const text = parsed.text || '';

        // Check for "Apartment X" pattern in Hebrew
        // דירה \d+
        const apartmentMatch = text.match(/דירה\s+\d+/);

        // Also check for "Defects" keyword which usually implies a table exists
        const defectsMatch = text.includes('ליקויים') || text.includes('ביצוע') || text.includes('סטטוס');

        // Check reversed?? (Sometimes PDF extraction reverses Hebrew)
        // דירה reversed is הריד
        const reversedMatch = text.includes('הריד') || text.includes('םייוקיל');

        return !!(apartmentMatch || defectsMatch || reversedMatch);
    } catch (e) {
        return false;
    }
}

// --- Run ---
async function run() {
    const filePath = String.raw`c:\Users\yoel\constructor\data\pdfs\2025-12-03 - מוסינזון 5 תל אביב.pdf`;

    if (!fs.existsSync(filePath)) {
        console.log("FILE_NOT_FOUND");
        return;
    }

    const buffer = fs.readFileSync(filePath);

    // Debug raw text length
    try {
        const parsed = await pdfParse(buffer);
        const text = parsed.text || '';
        console.log(`FINAL_TEXT_LENGTH: ${text.length}`);
        fs.writeFileSync('length.txt', String(text.length));
        if (text.length > 0) {
            fs.writeFileSync('text_sample.txt', text.substring(0, 1000));
        }
    } catch (e: any) {
        console.error("PDF_PARSE_ERROR_IN_DEBUG");
    }

    const hasApartments = await checkForApartmentData(buffer);

    if (hasApartments) {
        console.log("HEURISTIC_RESULT: FOUND_APARTMENTS");
    } else {
        console.log("HEURISTIC_RESULT: NO_APARTMENTS");
    }
}

run();
