#!/usr/bin/env python3
"""Provision the isolated R3 applicant in the local dev IAM realm; never prints credentials."""
import json,ssl,urllib.request,urllib.parse,secrets,os
from pathlib import Path
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--confirm',required=True,choices=['LOCAL-NEON-BP-R3-APPLICANT'])
parser.parse_args()
os.chdir(Path(__file__).resolve().parents[3])
base='https://iam.dev.athyper.test';ctx=ssl._create_unverified_context()
def call(path,data=None,method=None,token=None,form=False):
 headers={}
 if token:headers['Authorization']='Bearer '+token
 if data is not None:headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
 raw=(urllib.parse.urlencode(data) if form else json.dumps(data)).encode() if data is not None else None
 with urllib.request.urlopen(urllib.request.Request(base+path,data=raw,headers=headers,method=method),context=ctx) as r:
  b=r.read();return json.loads(b) if b else None
p=(Path.home()/'.athyper/instances/dev/secrets/iam-admin-password').read_text().strip()
t=call('/realms/master/protocol/openid-connect/token',{'grant_type':'password','client_id':'admin-cli','username':'athyper-admin','password':p},form=True)['access_token']
root='/admin/realms/athyper';user='acceptance.bp.r3.applicant'
users=call(root+'/users?username='+user+'&exact=true',token=t)
cache=Path('node_modules/.cache/bp-qualification');cache.mkdir(parents=True,exist_ok=True)
f=cache/'r3-applicant.json'
if users:
 assert f.exists(),'Existing applicant requires its retained local credential reference'
 record=json.loads(f.read_text());uid=users[0]['id'];assert uid==record['subjectId']
else:
 password=secrets.token_urlsafe(30)
 call(root+'/users',{'username':user,'enabled':True,'email':'bp-r3-applicant@example.test','emailVerified':True,'firstName':'R3','lastName':'Applicant','credentials':[{'type':'password','value':password,'temporary':False}]},method='POST',token=t)
 uid=call(root+'/users?username='+user+'&exact=true',token=t)[0]['id'];record={'username':user,'password':password,'subjectId':uid,'email':'bp-r3-applicant@example.test'}
 fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as out:json.dump(record,out)
org=next(o for o in call(root+'/organizations?max=1000',token=t) if o['alias']=='11111111-1111-4111-8111-111111111111')
try:call(root+'/organizations/'+org['id']+'/members',uid,method='POST',token=t)
except urllib.error.HTTPError as e:
 if e.code!=409:raise
client=call(root+'/clients?clientId=neon-web',token=t)[0]
role=call(root+'/clients/'+client['id']+'/roles/AUTHORIZED',token=t)
call(root+'/users/'+uid+'/role-mappings/clients/'+client['id'],[role],method='POST',token=t)
print('Applicant subject',uid,'credential reference',str(f))
