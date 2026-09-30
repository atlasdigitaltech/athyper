// Default: disposable qualification DB. DEV requires the explicit confirmation.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dev = process.argv.includes('--confirm=LOCAL-DEV-BP2-CHILD-ACTIVATION');
const container = dev ? 'athyper-dev-db-1' : 'athyper-bp2-acceptance-20260923';
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
if (dev ? inspect.Config.Labels['com.docker.compose.project'] !== 'athyper-dev' || inspect.Config.Labels['com.docker.compose.service'] !== 'db'
  : inspect.Config.Labels['athyper.environment'] !== 'disposable_local' || inspect.Config.Labels['athyper.purpose'] !== 'bp2-acceptance') throw Error('LOCAL_DB_REQUIRED');
const extract = (file, name) => {
  const source = readFileSync(file, 'utf8');
  const begin = source.indexOf('CREATE OR REPLACE FUNCTION ' + name + '(');
  if (begin < 0) throw Error('FUNCTION_MISSING');
  const end = source.indexOf('END $$;', begin);
  if (end < 0) throw Error('FUNCTION_TERMINATOR_MISSING');
  return source.slice(begin, end + 'END $$;'.length);
};
const master = 'server/db/ddl/planes/neon/master/07_functions.sql';
const statements = [
  extract(master, 'master.fn_pin_business_partner_child_activation'),
  extract(master, 'master.command_materialize_business_partner_change_case'),
  extract('server/db/ddl/planes/neon/document/07_functions.sql', 'document.command_entity_case_lifecycle'),
  'REVOKE ALL ON FUNCTION master.fn_pin_business_partner_child_activation(uuid,uuid,jsonb,boolean) FROM PUBLIC;',
  'GRANT EXECUTE ON FUNCTION master.fn_pin_business_partner_child_activation(uuid,uuid,jsonb,boolean) TO athyperapp,athyperadmin;',
];
execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'athyper_neon', '-v', 'ON_ERROR_STOP=1'], { input: 'BEGIN;\n'+statements.join('\n')+'\nCOMMIT;', stdio: ['pipe', 'inherit', 'inherit'] });
