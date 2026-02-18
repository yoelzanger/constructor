const { spawn } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, 'process-pdfs.js');
const INTERVAL_MS = 60 * 1000; // Run every minute

function runProcessor() {
    console.log(`[Worker] Starting PDF processor at ${new Date().toISOString()}...`);

    const child = spawn('node', [SCRIPT_PATH], {
        stdio: 'inherit',
        env: process.env // Pass through environment variables
    });

    child.on('close', (code) => {
        if (code === 0) {
            console.log('[Worker] Processor completed successfully.');
        } else {
            console.error(`[Worker] Processor exited with code ${code}`);
        }

        console.log(`[Worker] Sleeping for ${INTERVAL_MS / 1000} seconds...`);
        setTimeout(runProcessor, INTERVAL_MS);
    });

    child.on('error', (err) => {
        console.error('[Worker] Failed to start processor:', err);
        setTimeout(runProcessor, INTERVAL_MS);
    });
}

console.log('[Worker] Initializing background worker...');
runProcessor();
