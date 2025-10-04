// Script to check that all app/**/page.tsx files only have allowed Next.js exports
const fs = require('fs');
const path = require('path');

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

function findPageFiles(dir) {
  const files = [];
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

function extractExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const exports = [];

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

function checkPageExports() {
  const appDir = path.join(__dirname, '..', 'app');
  const pageFiles = findPageFiles(appDir);
  let hasErrors = false;

  console.log('Checking page exports...\n');

  for (const filePath of pageFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    const exports = extractExports(filePath);
    const invalidExports = exports.filter(exp => !ALLOWED_EXPORTS.includes(exp));

    if (invalidExports.length > 0) {
      console.log(`❌ ${relativePath}`);
      console.log(`   Invalid exports: ${invalidExports.join(', ')}`);
      console.log(`   Allowed exports: ${ALLOWED_EXPORTS.join(', ')}`);
      console.log('');
      hasErrors = true;
    } else {
      console.log(`✅ ${relativePath} (${exports.join(', ')})`);
    }
  }

  if (hasErrors) {
    console.log('\n❌ Some pages have invalid exports. Please move helper functions to utils.ts files.');
    process.exit(1);
  } else {
    console.log('\n✅ All page exports are valid!');
  }
}

checkPageExports();