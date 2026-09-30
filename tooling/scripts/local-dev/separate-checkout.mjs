import {execFileSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {join,relative,sep} from 'node:path';

// Explicit side-by-side qualification may never share writable source/build outputs.
export function assertSeparateCheckout(checkout, workspace, optedIn, git = (args) =>
  execFileSync('git',['-C',checkout,...args],{encoding:'utf8'}).trim()) {
  if (!workspace || !['source','container'].includes(workspace.mode)) return;
  if (!optedIn) throw new Error('Shared DEV is active; side-by-side startup requires --separate-checkout and an independent detached checkout');
  if (!workspace.checkout) throw new Error('Shared DEV checkout identity is missing');
  const candidate=realpathSync(checkout),shared=realpathSync(workspace.checkout);
  const inside=(a,b)=>{const r=relative(a,b);return !r || (r!=='..'&&!r.startsWith('..'+sep)&&!r.startsWith(sep));};
  if (inside(candidate,shared)||inside(shared,candidate)) throw new Error('Separate checkout must be outside shared DEV');
  if (git(['branch','--show-current']) || git(['status','--porcelain'])) throw new Error('Separate checkout requires clean detached source');
  for(const path of ['node_modules','apps/neon/node_modules','apps/studio/node_modules','apps/mesh/node_modules']) {
    const target=join(candidate,path);
    if (!existsSync(target)||!inside(candidate,realpathSync(target))) throw new Error('Separate checkout requires its own installed dependencies');
  }
}
