#!/usr/bin/env node

/**
 * Cleanup Duplicate Reports Script
 * 
 * This script identifies and removes duplicate PDF reports from the database.
 * Duplicates are detected by computing SHA256 hashes of PDF files.
 * 
 * Usage:
 *   node scripts/cleanup-duplicates.js           # Dry run - show what would be deleted
 *   node scripts/cleanup-duplicates.js --execute # Actually delete duplicates
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();
const PDF_DIR = path.join(process.cwd(), 'data', 'pdfs');

function computeFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function findDuplicates() {
  // Get all PDF files
  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  
  // Compute hashes for all files
  const fileHashes = new Map(); // hash -> [filenames]
  
  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    const hash = computeFileHash(filePath);
    
    if (!fileHashes.has(hash)) {
      fileHashes.set(hash, []);
    }
    fileHashes.get(hash).push(file);
  }
  
  // Find duplicates (hashes with more than one file)
  const duplicates = [];
  for (const [hash, fileNames] of fileHashes) {
    if (fileNames.length > 1) {
      duplicates.push({ hash, fileNames });
    }
  }
  
  return duplicates;
}

async function cleanupDuplicates(execute = false) {
  console.log('Scanning for duplicate PDF files...\n');
  
  const duplicates = await findDuplicates();
  
  if (duplicates.length === 0) {
    console.log('No duplicate files found.');
    return;
  }
  
  console.log(`Found ${duplicates.length} set(s) of duplicate files:\n`);
  
  for (const { hash, fileNames } of duplicates) {
    console.log(`Hash: ${hash.substring(0, 16)}...`);
    console.log(`Files:`);
    
    // Sort by filename - keep the one without "(1)" suffix
    const sorted = [...fileNames].sort((a, b) => {
      const aHasSuffix = a.includes('(1)');
      const bHasSuffix = b.includes('(1)');
      if (aHasSuffix && !bHasSuffix) return 1;
      if (!aHasSuffix && bHasSuffix) return -1;
      return a.localeCompare(b);
    });
    
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);
    
    console.log(`  KEEP: ${toKeep}`);
    for (const file of toDelete) {
      console.log(`  DELETE: ${file}`);
    }
    console.log('');
    
    if (execute) {
      for (const file of toDelete) {
        // Delete from database
        const report = await prisma.report.findUnique({
          where: { fileName: file },
        });
        
        if (report) {
          // Delete related records first (cascade should handle this, but be safe)
          await prisma.workItem.deleteMany({ where: { reportId: report.id } });
          await prisma.inspection.deleteMany({ where: { reportId: report.id } });
          await prisma.report.delete({ where: { id: report.id } });
          console.log(`  Deleted report from database: ${file}`);
        }
        
        // Delete the file
        const filePath = path.join(PDF_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`  Deleted file: ${file}`);
        }
      }
      
      // Update the kept report with the hash
      const keptReport = await prisma.report.findUnique({
        where: { fileName: toKeep },
      });
      if (keptReport) {
        await prisma.report.update({
          where: { id: keptReport.id },
          data: { fileHash: hash },
        });
        console.log(`  Updated hash for: ${toKeep}`);
      }
    }
  }
  
  if (!execute) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Run with --execute flag to actually delete duplicates:');
    console.log('  node scripts/cleanup-duplicates.js --execute');
  } else {
    console.log('\nCleanup completed successfully.');
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  
  try {
    await cleanupDuplicates(execute);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
