import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeThemeTokenIntegrity } from '../policy/verify-theme-token-integrity.mjs';

export const roots = [
  'packages/platform/entity/runtime/form-detail/src',
  'packages/platform/entity/runtime/list-view/src',
  'packages/platform/communications/collaboration-ui/src',
];
const copyKeys = new Set(['title','label','description','placeholder','aria-label','alt','message','emptyMessage','loadingMessage','errorMessage']);
const copyCalls = new Set(['alert','confirm','prompt','setError','setStatus','setNotice']);
/** Candidates, not a claim that every string is visible or requires translation. */
export function textCandidates(source, file='fixture.tsx') {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const found=[];
  const add=(node,kind,text)=>{text=text.replace(/\s+/g,' ').trim();if(/[A-Za-z]/.test(text))found.push({line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,kind,text});};
  function visit(node){
    if(ts.isJsxText(node))add(node,'jsx-text',node.text);
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
      const parent=node.parent;
      if(ts.isJsxExpression(parent) && (ts.isJsxElement(parent.parent)||ts.isJsxFragment(parent.parent)))add(node,'jsx-expression',node.text);
      else if(ts.isJsxAttribute(parent)&&copyKeys.has(parent.name.getText(ast)))add(node,'jsx-attribute',node.text);
      else if(ts.isPropertyAssignment(parent)&&parent.initializer===node&&copyKeys.has(parent.name.getText(ast).replace(/^['"]|['"]$/g,'')))add(node,'copy-property',node.text);
      else if(ts.isCallExpression(parent)&&copyCalls.has(parent.expression.getText(ast)))add(node,'copy-call',node.text);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);return found;
}
/** Declaration inventory, excluding comments and token definitions. Not a CSS conformance parser. */
export function cssCandidates(source){
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));
  const found=[];
  for(const m of clean.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)){
    const [,property,value]=m;
    if(property.startsWith('--')||!/(?:\d(?:px|rem|em|vh|vw|dvh|svh|%)\b|#[\da-f]{3,8}\b|rgba?\()/i.test(value))continue;
    found.push({line:clean.slice(0,m.index).split('\n').length,property,value:value.trim(),kind:/^(font|color|background|border|outline|box-shadow)/.test(property)?'semantic-review':'layout-review'});
  }
  return found;
}
function filesBelow(dir){return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?filesBelow(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
export function inventory(root=process.cwd()){
  const files=roots.flatMap(dir=>filesBelow(resolve(root,dir))).filter(p=>/\.(tsx?|css)$/.test(p)&&!/(?:\.test\.|__tests__)/.test(p));
  const entries=files.map(file=>{
    const source=readFileSync(file,'utf8'),path=relative(root,file);
    const text=file.endsWith('.css')?[]:textCandidates(source,file),css=file.endsWith('.css')?cssCandidates(source):[];
    return {path,sha256:createHash('sha256').update(source).digest('hex'),text,css};
  });
  return {schemaVersion:1,scope:roots,limitations:['Static candidates require review; identifiers in copy properties can be false positives.','Dynamic concatenations, conditional literals, inline styles and descriptor-provided labels are not exhaustively classified.','CSS declaration counts include legitimate layout values, not just defects.'],totals:{files:entries.length,textCandidates:entries.reduce((n,e)=>n+e.text.length,0),textFiles:entries.filter(e=>e.text.length).length,cssCandidates:entries.reduce((n,e)=>n+e.css.length,0)},theme:analyzeThemeTokenIntegrity({root,targetRoots:roots}),entries};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(inventory(),null,2));
