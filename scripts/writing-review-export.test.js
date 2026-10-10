const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {build}=require('esbuild');
async function load(entry){const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'writing-review-')),'module.cjs');await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});return require(outfile)}
const review=load('lib/writing-review.ts'),exportsReady=load('lib/doc-export.ts');
test('paragraph review preserves exact separators and handles changed structure without duplicating',async()=>{
 const {buildWritingReview,materializeWritingReview,paragraphIndicesForSelection}=await review;
 const source='First paragraph.\r\n\r\n  Second paragraph.\n\n';
 const candidate='Edited paragraph.\r\n\r\n  Second paragraph.\n\n';
 const parts=buildWritingReview(source,candidate);assert.equal(materializeWritingReview(parts),candidate);parts[0].decision='reject';assert.equal(materializeWritingReview(parts),source);
 const regrouped=buildWritingReview(source,'Merged into one paragraph.');assert.equal(regrouped.length,1);regrouped[0].decision='reject';assert.equal(materializeWritingReview(regrouped),source);
 assert.deepEqual(paragraphIndicesForSelection(source,source.indexOf('Second'),source.indexOf('Second')+6),[1]);assert.deepEqual(paragraphIndicesForSelection(source,0,0),[]);
});
test('TXT exports exact editor text without title or assistance footer',async()=>{
 const {exportDocument}=await exportsReady;const text='  1. First\n2. Second\n\n[1] Source\n';const result=await exportDocument(text,{format:'txt',title:'Filename only'});assert.equal(await result.blob.text(),text);assert.match(result.filename,/filename_only/);
});
test('Word preserves numbered markers and citations without adding title/footer',async()=>{
 const {exportDocument}=await exportsReady;const result=await exportDocument('1. First\n2. Second\n\n[1] Source',{format:'docx',title:'Filename only'});
 const zip=await require('jszip').loadAsync(await result.blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('string');assert.match(xml,/1\. First/);assert.match(xml,/2\. Second/);assert.match(xml,/\[1\] Source/);assert.doesNotMatch(xml,/Filename only|Generated with|numPr/);
});
