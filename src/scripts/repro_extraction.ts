
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as pdfLib from 'pdf-parse';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

// Fix pdf-parse import
const pdf = (pdfLib as any).default || pdfLib;

// --- Mocking validation types ---
interface ExtractedWorkItem {
    category: string;
    location?: string;
    description: string;
    status: string;
    notes?: string;
    hasPhoto?: boolean;
}

interface ExtractedApartmentData {
    apartmentNumber: string;
    workItems: ExtractedWorkItem[];
    inspectionDates?: Record<string, string>;
}

interface ExtractedReportData {
    reportDate: string;
    inspector?: string;
    projectName?: string;
    apartments: ExtractedApartmentData[];
    developmentItems?: ExtractedWorkItem[];
    progressTracking?: {
        apartmentNumber: string;
        category: string;
        inspectionDate?: string;
        status?: string;
    }[];
}

class BlockingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BlockingError';
    }
}

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


// --- Prompts ---
const EXTRACTION_PROMPT = `You are analyzing a Hebrew construction progress report PDF for a TAMA 38/2 urban renewal project at Mosinzon 5, Tel Aviv.

Extract the following information and return it as a valid JSON object:

1. **Report Metadata**:
   - reportDate: The date of the report in YYYY-MM-DD format
   - inspector: The name of the inspector if mentioned
   - projectName: The project name/address

2. **Apartments Data**: For each apartment mentioned (typically apartments 1, 3, 5, 6, 7, 10, 11, 14):
   - apartmentNumber: The apartment number as a string
   - workItems: Array of work items with:
     - category: Work category in Hebrew (חשמל, אינסטלציה, מיזוג, דלת כניסה, סניטריה, ריצוף, חיפוי, ספרינקלרים, איטום, etc.)
     - location: Specific location within the apartment if mentioned
     - description: Description of the work item
     - status: Status in Hebrew (בוצע, בוצע - תקין, לא תקין, ליקוי, בטיפול, טופל, etc.)
     - notes: Any additional notes
     - hasPhoto: true if there's a photo associated with this item
   - inspectionDates: Object mapping category to inspection date if available

3. **Development Items**: Site-level work not specific to an apartment:
   - Same structure as workItems but for general/building-level work

4. **Progress Tracking Table**: If there's a tracking table showing inspection dates by apartment and category:
   - apartmentNumber
   - category
   - inspectionDate
   - status

5. **Completeness Check**:
   - Verify checking against the document page count.
   - EXTRACT EVERY SINGLE WORK ITEM. Do not summarize or group items.
   - If there are lists of defects, include ALL of them.

Return ONLY valid JSON, no explanations.`;

const APARTMENT_LIST_PROMPT = `You are analyzing a Hebrew construction progress report PDF.
Return a valid JSON object containing a list of all apartment numbers mentioned in the report for which there is specific data or work items.
Format: { "apartments": ["1", "3", "7", ...] }
Return ONLY JSON.`;

const CHUNK_EXTRACTION_PROMPT = (apartments: string[]) => `You are analyzing a Hebrew construction progress report PDF.
EXTRACT DATA ONLY FOR THE FOLLOWING APARTMENTS: ${apartments.join(', ')}.
Do NOT extract data for other apartments.
Do NOT extract Report Metadata or Development Items (those are extracted separately).

Return a valid JSON object with the following structure:
{
  "apartmentsData": [
    {
      "apartmentNumber": "X",
      "workItems": [...],
      "inspectionDates": {...}
    }
  ]
}
Follow the same detailed extraction rules as before (extract ALL items, statuses, notes, photos).
Return ONLY valid JSON.`;

const METADATA_DEV_PROMPT = `You are analyzing a Hebrew construction progress report PDF.
Extract ONLY:
1. Report Metadata (date, inspector, project name)
2. Development Items (site-level work)
3. Progress Tracking Table

Do NOT extract per-apartment data matching specific apartment numbers.
Return a valid JSON object with keys: "reportMetadata", "developmentItems", "progressTracking".
Return ONLY valid JSON.`;

// --- Providers ---
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');

interface AIProvider {
    name: string;
    extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string>;
}

class AnthropicAdapter implements AIProvider {
    name = 'Anthropic (Claude)';
    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        if (mimeType !== 'application/pdf') throw new Error('Anthropic adapter currently supports only PDF');
        const base64Data = buffer.toString('base64');
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20240620', // Explicit version
            max_tokens: 8192,
            messages: [{
                role: 'user',
                content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
                    { type: 'text', text: prompt }
                ]
            }]
        });
        return (response.content.find(c => c.type === 'text') as any)?.text || '';
    }
}

class OpenAIAdapter implements AIProvider {
    name = 'OpenAI (GPT-4o)';
    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        let content = '';
        if (mimeType === 'application/pdf') {
            try {
                const parsed = await pdf(buffer);
                content = `Document Content:\n${parsed.text}\n\n`;
            } catch (e: any) {
                console.error("OpenAI Adapter PDF Parse Error:", e);
                throw new Error("Failed to parse PDF text for OpenAI fallback");
            }
        } else {
            content = "Unsupported Mime Type for OpenAI Direct Raw";
        }
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful assistant that extracts data from construction reports. Output valid JSON only." },
                { role: "user", content: content + prompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 4096
        });
        return response.choices[0].message.content || '';
    }
}

class GeminiAdapter implements AIProvider {
    name = 'Gemini (Flash 2.0)';
    async extract(prompt: string, buffer: Buffer, mimeType: string): Promise<string> {
        // Updated model name
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const base64Data = buffer.toString('base64');
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType: mimeType } }
        ]);
        return result.response.text();
    }
}

const providers: AIProvider[] = [
    new AnthropicAdapter(),      // Primary
    new OpenAIAdapter(),         // Secondary
    new GeminiAdapter()          // Tertiary
];

// --- Utilities ---
function repairJson(jsonStr: string): string {
    let repaired = jsonStr.trim();
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    return repaired;
}

// --- Logic ---
async function tryExtractWithProviders(prompt: string, buffer: Buffer): Promise<string> {
    const errors: string[] = [];
    for (const provider of providers) {
        console.log(`Attempting extraction with ${provider.name}...`);
        try {
            const result = await provider.extract(prompt, buffer, 'application/pdf');
            if (result && result.length > 20) {
                console.log(`Success with ${provider.name}`);
                return result;
            }
            errors.push(`${provider.name}: Returned empty result`);
        } catch (error: any) {
            console.error(`Failed with ${provider.name}:`, error.message);
            errors.push(`${provider.name}: ${error.message}`);
        }
    }
    throw new BlockingError(`All providers failed: ${errors.join('; ')}`);
}

async function extractApartmentList(buffer: Buffer): Promise<string[]> {
    try {
        const text = await tryExtractWithProviders(APARTMENT_LIST_PROMPT, buffer);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];
        try {
            const data = JSON.parse(jsonMatch[0]);
            return data.apartments || [];
        } catch {
            return [];
        }
    } catch (error) {
        console.error('Error fetching apartment list:', error);
        return [];
    }
}

async function extractPdfDataChunked(buffer: Buffer): Promise<ExtractedReportData> {
    console.log('Falling back to chunked extraction...');
    const apartmentList = await extractApartmentList(buffer);
    console.log(`Found apartments: ${apartmentList.join(', ')}`);

    let fullData: ExtractedReportData = {
        reportDate: '',
        apartments: [],
        developmentItems: [],
        progressTracking: []
    };

    try {
        const metadataText = await tryExtractWithProviders(METADATA_DEV_PROMPT, buffer);
        console.log("Metadata response received length: " + metadataText.length);
        const metadataJsonMatch = metadataText.match(/\{[\s\S]*\}/);
        if (metadataJsonMatch) {
            try {
                const meta = JSON.parse(repairJson(metadataJsonMatch[0]));
                fullData = { ...fullData, ...meta };
            } catch (e) {
                console.error('Failed to parse metadata chunk:', e);
            }
        }
    } catch (error) {
        console.error('Failed to extract metadata in chunked mode', error);
        if (error instanceof BlockingError) throw error;
    }

    const CHUNK_SIZE = 3;
    const allApartmentsData: ExtractedApartmentData[] = [];

    for (let i = 0; i < apartmentList.length; i += CHUNK_SIZE) {
        const chunk = apartmentList.slice(i, i + CHUNK_SIZE);
        console.log(`Extracting chunk: ${chunk.join(', ')}`);
        try {
            const prompt = CHUNK_EXTRACTION_PROMPT(chunk);
            const text = await tryExtractWithProviders(prompt, buffer);
            console.log(`Chunk response received length: ${text.length}`);

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const chunkData = JSON.parse(repairJson(jsonMatch[0]));
                if (chunkData.apartmentsData) {
                    allApartmentsData.push(...chunkData.apartmentsData);
                }
            } else {
                console.log("No JSON found in chunk response");
            }
        } catch (e: any) {
            console.error(`Failed to extract chunk ${chunk.join(', ')}:`, e);
            if (e instanceof BlockingError) throw e;
        }
    }

    fullData.apartments = allApartmentsData;
    return fullData;
}

async function extractPdfData(pdfBuffer: Buffer): Promise<ExtractedReportData> {
    console.log('Starting standard extraction...');
    try {
        const textContent = await tryExtractWithProviders(EXTRACTION_PROMPT, pdfBuffer);
        console.log(`Standard response received length: ${textContent.length}`);

        let extractedData: ExtractedReportData;
        try {
            const codeBlockMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (codeBlockMatch) {
                extractedData = JSON.parse(repairJson(codeBlockMatch[1]));
            } else {
                const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('No JSON found in response');
                extractedData = JSON.parse(repairJson(jsonMatch[0]));
            }

            const aptCount = extractedData.apartments?.length || 0;
            const totalItems = (extractedData.apartments || []).reduce((sum, a) => sum + (a.workItems?.length || 0), 0) + (extractedData.developmentItems?.length || 0);

            console.log(`Standard extraction result: ${aptCount} apartments, ${totalItems} items.`);

            if (aptCount === 0 || totalItems < 5) {
                console.log('Result looks incomplete. Triggering chunked extraction...');
                throw new Error('Incomplete extraction result');
            }
            return extractedData;

        } catch (parseError) {
            console.log('JSON parse failed or result incomplete', parseError);
            console.log('Attempting chunked extraction fallback...');
            return await extractPdfDataChunked(pdfBuffer);
        }
    } catch (error: any) {
        if (error instanceof BlockingError) throw error;
        console.error('Extraction fatal error:', error);
        throw error;
    }
}

// --- Run ---
async function run() {
    // Clear log
    fs.writeFileSync('repro.log', '');

    const filePath = String.raw`c:\Users\yoel\constructor\data\pdfs\2025-12-03 - מוסינזון 5 תל אביב.pdf`;

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    console.log(`Reading file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);

    try {
        console.log('Starting extraction...');
        const data = await extractPdfData(buffer);
        console.log('Extraction success!');
        // Print distinct counts
        const aptCount = data.apartments?.length || 0;
        const totalItems = (data.apartments || []).reduce((sum, a) => sum + (a.workItems?.length || 0), 0) + (data.developmentItems?.length || 0);
        console.log(`Final Result: ${aptCount} apartments, ${totalItems} items.`);

        // Save output to inspect
        fs.writeFileSync('repro_output.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Extraction failed:', error);
    }
}

run();
