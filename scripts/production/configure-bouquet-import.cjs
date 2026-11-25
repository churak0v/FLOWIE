/* global process, console */
// Transfer the existing backup-bucket credentials without printing or saving them locally.
const { spawnSync } = require('node:child_process');
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
if (!process.argv.includes('--apply')) {
  console.log('Use --apply to configure FLOWIE import on flowie-prod from the approved SPEKA backup bucket.');
  process.exit(0);
}
const sourceCode = `const e=process.env;process.stdout.write(JSON.stringify({
  FLOWIE_IMPORT_S3_BUCKET:'speka-production-backups-20261116',
  FLOWIE_IMPORT_S3_ENDPOINT:e.AWS_S3_ENDPOINT,
  FLOWIE_IMPORT_S3_REGION:e.AWS_REGION||e.AWS_DEFAULT_REGION,
  FLOWIE_IMPORT_S3_ACCESS_KEY_ID:e.AWS_ACCESS_KEY_ID,
  FLOWIE_IMPORT_S3_SECRET_ACCESS_KEY:e.AWS_SECRET_ACCESS_KEY
}));`;
const source = spawnSync('ssh', ['-o', 'BatchMode=yes', 'pum',
  `docker exec speka-backend-prod node -e ${quote(sourceCode)}`], { maxBuffer: 65536 });
if (source.status !== 0) throw new Error('BACKUP_CREDENTIAL_SOURCE_UNAVAILABLE');
const values = JSON.parse(source.stdout.toString());
if (Object.values(values).some((value) => typeof value !== 'string' || !value || /[\r\n]/.test(value))) {
  throw new Error('BACKUP_CREDENTIAL_SOURCE_INCOMPLETE');
}
const targetCode = `import sys,json,pathlib,secrets,shutil,datetime,os
p=pathlib.Path('/srv/flowie/app/.env.production')
values=json.load(sys.stdin)
assert values['FLOWIE_IMPORT_S3_BUCKET']=='speka-production-backups-20261116'
old=p.read_text()
current={line.split('=',1)[0]:line.split('=',1)[1] for line in old.splitlines() if '=' in line and not line.startswith('#')}
for k,v in list(current.items()):
 if v.startswith(chr(34)) and v.endswith(chr(34)):
  current[k]=json.loads(v)
values.update({'FLOWIE_BOUQUET_IMPORT_ENABLED':'true','BOUQUET_IMPORT_AI_BATCH_ENABLED':'true','TELEGRAM_BOUQUET_IMPORT_CHAT_IDS':'1780687976','TELEGRAM_BOUQUET_IMPORT_USER_IDS':'1780687976','FLOWIE_IMPORT_BATCH_MODEL':'gpt-6-luna','TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET':current.get('TELEGRAM_BOUQUET_IMPORT_WEBHOOK_SECRET') or secrets.token_hex(32)})
backup=p.with_name('.env.production.bouquet-before-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
shutil.copy2(p,backup);os.chmod(backup,0o600)
lines=[line for line in old.splitlines() if line.split('=',1)[0] not in values]
for k,v in values.items():
 assert '\\n' not in v and '\\r' not in v
 lines.append(k+'='+json.dumps(v))
temp=p.with_name('.env.production.bouquet-new');temp.touch(mode=0o600,exist_ok=False)
temp.write_text('\\n'.join(lines)+'\\n');os.chmod(temp,0o600);temp.replace(p)
print('FLOWIE import environment configured; existing SPEKA objects unchanged')`;
const target = spawnSync('ssh', ['-o', 'BatchMode=yes', 'flowie-prod', `python3 -c ${quote(targetCode)}`], {
  input: JSON.stringify(values), maxBuffer: 65536,
});
source.stdout.fill(0);
if (target.status !== 0) throw new Error('FLOWIE_IMPORT_ENV_UPDATE_FAILED');
console.log(target.stdout.toString().trim());
