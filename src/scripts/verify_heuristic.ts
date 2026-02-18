
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as pdfLib from 'pdf-parse';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

// Fix pdf-parse import using createRequire for ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// @ts-ignore
const pdfLib = require('pdf-parse');
const pdfParse = typeof pdfLib === 'function' ? pdfLib : pdfLib.default;

// --- Logger ---
function logToFile(msg: string) {
    try {
        fs.appendFileSync('repro.log', msg + '\n');
    } catch (e) {
        // ignore
    }
}

const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
    const msg = args.map(a => String(a)).join(' ');
    logToFile(msg);
    originalLog.apply(console, args);
};
console.error = function (...args) {
    const msg = 'ERROR: ' + args.map(a => String(a)).join(' ');
    logToFile(msg);
    originalError.apply(console, args);
};


// --- Heuristic ---
async function checkForApartmentData(buffer: Buffer): Promise<boolean> {
    try {
        console.log("Running heuristic check...");
        const parsed = await pdfParse(buffer);
        const text = parsed.text || '';

        // Check for "Apartment X" pattern in Hebrew
        // דירה \d+
        const apartmentMatch = text.match(/דירה\s+\d+/);

        // Also check for "Defects" keyword which usually implies a table exists
        const defectsMatch = text.includes('ליקויים') || text.includes('ביצוע') || text.includes('סטטוס');

        console.log(`Text length: ${text.length}`);
        console.log(`Apartment Match: ${!!apartmentMatch}`);
        console.log(`Defects Match: ${defectsMatch}`);

        return !!(apartmentMatch || defectsMatch);
    } catch (e) {
        console.error("Heuristic check failed:", e);
        return false;
    }
}

// --- Run ---
async function run() {
    // Clear log
    fs.writeFileSync('repro.log', '');

    // Test the specific file
    const filePath = String.raw`c:\Users\yoel\constructor\data\pdfs\2025-12-03 - מוסינזון 5 תל אביב.pdf`;

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    console.log(`Reading file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);

    // 1. Test Heuristic
    const hasApartments = await checkForApartmentData(buffer);
    console.log(`Has apartments? ${hasApartments}`);

    if (hasApartments) {
        console.log("Heuristic detected apartments. If extraction fails with 0 items, it should be an ERROR.");
    } else {
        console.log("Heuristic did NOT detect apartments. If extraction 0 items, it is VALID EMPTY.");
    }

}

run();
