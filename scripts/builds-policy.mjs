import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Official system variables: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
// CPL_DEPLOY_TARGET is a custom build variable set ONLY on the production trigger.
// Native Builds must use `npm run deploy:builds`; a bare upload bypasses this gate.
export function assertProductionEnvironment(env) {
  if (env.WORKERS_CI !== '1') throw new Error('Production Builds deployment requires the native Workers Builds environment. Use the separately gated local deploy command for an authorized local release.');
  if (env.WORKERS_CI_BRANCH !== 'main') throw new Error('Production Builds deployment requires an explicit main branch; preview and unknown branches are blocked.');
  if (env.CPL_DEPLOY_TARGET !== 'production') throw new Error('The production-only CPL_DEPLOY_TARGET build variable is missing. Preview builds must never receive it.');
  if (!/^[a-f0-9]{40}$/i.test(env.WORKERS_CI_COMMIT_SHA ?? '')) throw new Error('Workers Builds did not provide a valid source commit.');
  return env.WORKERS_CI_COMMIT_SHA.toLowerCase();
}

export function assertSourceCommit(expected, actual) {
  if (actual.trim().toLowerCase() !== expected) throw new Error('The checked-out source does not match the native build commit.');
}

export function runProductionPolicy(env = process.env) {
  const expected = assertProductionEnvironment(env);
  const git = (args) => execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assertSourceCommit(expected, git(['rev-parse', 'HEAD']));
  // A build must not silently alter tracked source before publication.
  git(['diff', '--quiet', 'HEAD', '--']);
  console.log('PASS: native production trigger, main branch, matching commit, and unchanged tracked source.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runProductionPolicy();
