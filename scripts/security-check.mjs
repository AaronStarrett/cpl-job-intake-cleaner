import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ignored = new Set(['node_modules', 'dist', '.git', '.wrangler', 'coverage', 'test-results', 'playwright-report', 'work']);
const forbidden = /(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|\.wrangler(?:\/|$)|node_modules(?:\/|$)|.*\.(?:pem|key|p12|pfx)|credentials[^/]*|hosts\.yml)(?:$|\/)/i;
const allowedExample = /(?:^|\/)(?:\.env\.example|\.dev\.vars\.example)$/;
const secrets = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:OPENAI_API_KEY|TURNSTILE_SECRET_KEY|QUOTA_HASH_SECRET|CLOUDFLARE_API_TOKEN)[ \t]*[=:][ \t]*["']?(?!["']?(?:$|example|replace|your|<|undefined|process|env|test|synthetic))([A-Za-z0-9_-]{24,})/i,
  /[A-Z]:\\Users\\[^\r\n"']+/,
];
const problems = new Set();
function inspect(name, bytes) {
  if (forbidden.test(name) && !allowedExample.test(name)) problems.add(`${name}: forbidden public path`);
  if (/\.(?:png|jpg|jpeg|webp|avif|woff2?|ico)$/.test(name)) return;
  const body = bytes.toString('utf8');
  for (const pattern of secrets) if (pattern.test(body)) problems.add(`${name}: potential private material (value hidden)`);
}
function walk(dir = '.') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(name) : [name.replaceAll('\\', '/')];
  });
}
const git = (args) => execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], { maxBuffer: 32 * 1024 * 1024 });
if (process.argv.includes('--staged')) {
  for (const name of git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString().split('\0').filter(Boolean)) inspect(name, git(['show', `:${name}`]));
} else if (process.argv.includes('--history')) {
  for (const line of git(['rev-list', '--objects', '--all']).toString().split('\n').filter(Boolean)) {
    const [oid, ...parts] = line.split(' '); const name = parts.join(' ');
    if (name && git(['cat-file', '-t', oid]).toString().trim() === 'blob') inspect(name, git(['cat-file', 'blob', oid]));
  }
} else {
  for (const name of walk()) inspect(name, readFileSync(name));
  if (existsSync('dist/client')) {
    const clientFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? clientFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    for (const name of clientFiles('dist/client')) {
      if (/\.(js|html)$/.test(name)) {
        const body = readFileSync(name, 'utf8');
        if (/OPENAI_API_KEY|TURNSTILE_SECRET_KEY|QUOTA_HASH_SECRET|api\.openai\.com/.test(body)) problems.add(`${name}: server secret/provider marker in browser output`);
      }
    }
  }
}
if (problems.size) { console.error([...problems].join('\n')); process.exit(1); }
console.log('PASS: public-source scan; no matching credential/private-path patterns. Human file/history review is also required.');
