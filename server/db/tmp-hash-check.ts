import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const fs = readFileSync('D:/Products/athyper/server/db/seed/tenants/neon/020_technostat/200_finance/510_budget_planning.sql','utf8');
const norm=fs.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
console.log(createHash('sha256').update(norm).digest('hex'));
