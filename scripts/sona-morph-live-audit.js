const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-live-morph-audit-'));
const outfile = path.join(outdir, 'sona-live-morph-audit.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'sona', 'morph-live-audit.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

async function main() {
  const { runSonaMorphLiveAudit } = require(outfile);
  const report = await runSonaMorphLiveAudit();
  const outputPath = path.join(repoRoot, 'output', 'sona-morph-live-audit.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    outputPath,
    caseCount: report.caseCount,
    successfulCases: report.successfulCases,
    safeCases: report.safeCases,
    usefulCases: report.usefulCases,
    regressedCases: report.regressedCases,
    blockedChangeCount: report.blockedChangeCount,
    truthPassed: report.truthPassed,
    utilityPassed: report.utilityPassed,
    releaseReady: report.releaseReady,
  }, null, 2));
  if (!report.releaseReady) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
