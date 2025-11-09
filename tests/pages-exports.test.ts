// Test that all app/**/page.tsx files only export allowed Next.js exports
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ALLOWED_EXPORTS = [
  'default',
  'generateMetadata',
  'generateStaticParams',
  'revalidate',
  'dynamic',
  'dynamicParams',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'metadata'
];

function findPageFiles(dir: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findPageFiles(fullPath));
    } else if (item === 'page.tsx' || item === 'page.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

function extractExports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const exports: string[] = [];

  // Find all export statements
  const exportMatches = content.match(/export\s+(?:const|function|class|let|var)\s+(\w+)/g);
  if (exportMatches) {
    exportMatches.forEach(match => {
      const name = match.match(/export\s+(?:const|function|class|let|var)\s+(\w+)/)?.[1];
      if (name && name !== 'default') {
        exports.push(name);
      }
    });
  }

  // Check for export default
  if (content.includes('export default')) {
    exports.push('default');
  }

  return exports;
}

describe('Page exports validation', () => {
  it('should only have allowed Next.js exports in page files', () => {
    const appDir = path.join(__dirname, '..', 'app');
    const pageFiles = findPageFiles(appDir);

    expect(pageFiles.length).toBeGreaterThan(0);

    for (const filePath of pageFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const exports = extractExports(filePath);
      const invalidExports = exports.filter(exp => !ALLOWED_EXPORTS.includes(exp));

      expect(invalidExports).toEqual([]);
    }
  });
});