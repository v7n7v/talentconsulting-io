// Read-only audit reproduction. No provider calls or application data writes.
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { buildSync } = require(path.join(root, 'node_modules/esbuild'));
buildSync({stdin:{contents:"export * from './lib/ai-detection'; export * from './lib/writing-quality';",resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:'/tmp/humanizer-eval-modules.cjs'});
const q=require('/tmp/humanizer-eval-modules.cjs');
const pairs=[
['negation','I did not lead the migration because my role focused on testing and documenting defects.','I led the migration because my role focused on testing and documenting defects.'],
['percentage','I reduced deployment failures by 12% through careful testing and clearer release instructions.','I reduced deployment failures by 92% through careful testing and clearer release instructions.'],
['technical-units','I reduced request latency from 120 ms to 80 ms after fixing a database query.','I reduced request latency from 920 ms to 10 ms after fixing a database query.'],
['citation-quote','The report states "no causal effect was demonstrated" after reviewing the trial data [1].','The report states "a strong causal effect was demonstrated" after reviewing the trial data [1].'],
['entity-role-swap','I mentored Jane Smith while Alex Jones managed the release and reviewed every production change.','I mentored Alex Jones while Jane Smith managed the release and reviewed every production change.'],
['single-name','I used Python at Microsoft to write tests and maintain internal tools for colleagues.','I used Java at Google to write tests and maintain internal tools for colleagues.'],
['protected-substring','I saved $10 by reviewing monthly charges and cancelling a service our team never used.','I saved $100 by reviewing monthly charges and cancelling a service our team never used.'],
['short-valid','Built tests that caught release regressions.','Built tests that caught release regressions.'],
['preserve-quoted-terms','The client requested "robust, seamless, innovative" language, but I kept the proposal plain and factual.','The client requested "robust, seamless, innovative" language, but I kept the proposal plain and factual.'],
['chinese','我负责测试与缺陷记录，协助团队完成数据库迁移，并为新同事编写操作说明。','我负责测试与缺陷记录，协助团队完成数据库迁移，并为新同事编写操作说明。'],
['spanish','Organicé las pruebas del sistema y documenté los errores para ayudar al equipo durante la migración.','Organicé las pruebas del sistema y documenté los errores para ayudar al equipo durante la migración.'],
['french','Je rédige les tests du logiciel et je documente les erreurs pour aider les collègues pendant la migration.','Je rédige les tests du logiciel et je documente les erreurs pour aider les collègues pendant la migration.'],
];
const results=pairs.map(([id,originalText,rewrittenText])=>{const originalDetection=q.detectAI(originalText),finalDetection=q.detectAI(rewrittenText),protectedTerms=q.extractProtectedTerms(originalText);return {id,originalText,rewrittenText,protectedTerms,originalDetection,finalDetection,quality:q.evaluateHumanizationQuality({originalText,rewrittenText,protectedTerms,lengthMode:'exact',originalDetection,finalDetection})}});
require('fs').writeFileSync('/tmp/humanizer-corpus-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(x=>({id:x.id,terms:x.protectedTerms,score:[x.originalDetection.humanScore,x.finalDetection.humanScore],breakdown:x.finalDetection.breakdown,decision:x.quality.decision,gates:x.quality.gates.filter(y=>y.status!=='pass')})),null,2));
