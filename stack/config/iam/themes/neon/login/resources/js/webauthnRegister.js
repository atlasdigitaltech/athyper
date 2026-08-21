// Neon theme — self-contained webauthnRegister.js (no rfc4648 dependency)
// Matches KC registerByWebAuthn(input) interface exactly.

function b64urlDecode(s) {
  if (!s) return new Uint8Array(0);
  const b = atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(s.length+(4-s.length%4)%4,'='));
  const a = new Uint8Array(b.length);
  for (let i=0;i<b.length;i++) a[i]=b.charCodeAt(i);
  return a;
}

function b64urlEncode(buf) {
  const a=new Uint8Array(buf); let s='';
  for (let i=0;i<a.length;i++) s+=String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

export async function registerByWebAuthn(input) {
  if (!window.PublicKeyCredential) { returnFailure(input.errmsg||'WebAuthn not supported'); return; }

  const pubKey = {
    challenge: b64urlDecode(input.challenge),
    rp:   { id: input.rpId, name: input.rpEntityName },
    user: { id: b64urlDecode(input.userid), name: input.username, displayName: input.username },
    pubKeyCredParams: (input.signatureAlgorithms||[-7]).map(a=>({type:'public-key',alg:a})),
  };

  if (input.attestationConveyancePreference!=='not specified') pubKey.attestation=input.attestationConveyancePreference;

  const sel={}; let selSet=false;
  if (input.authenticatorAttachment!=='not specified'){ sel.authenticatorAttachment=input.authenticatorAttachment; selSet=true; }
  if (input.requireResidentKey!=='not specified'){ sel.requireResidentKey=input.requireResidentKey==='Yes'; selSet=true; }
  if (input.userVerificationRequirement!=='not specified'){ sel.userVerification=input.userVerificationRequirement; selSet=true; }
  if (selSet) pubKey.authenticatorSelection=sel;
  if (input.createTimeout!==0) pubKey.timeout=input.createTimeout*1000;

  const excl=(input.excludeCredentialIds||'').split(',').filter(Boolean).map(id=>({type:'public-key',id:b64urlDecode(id)}));
  if (excl.length) pubKey.excludeCredentials=excl;

  try {
    const cred=await navigator.credentials.create({publicKey:pubKey});
    document.getElementById('clientDataJSON').value=b64urlEncode(cred.response.clientDataJSON);
    document.getElementById('attestationObject').value=b64urlEncode(cred.response.attestationObject);
    document.getElementById('publicKeyCredentialId').value=b64urlEncode(cred.rawId);
    if (typeof cred.response.getTransports==='function') document.getElementById('transports').value=(cred.response.getTransports()||[]).join(',');
    let lbl=input.initLabelPrompt?window.prompt(input.initLabelPrompt,input.initLabel||''):input.initLabel||'';
    if (lbl===null) lbl=input.initLabel||'';
    document.getElementById('authenticatorLabel').value=lbl;
    document.getElementById('register').requestSubmit();
  } catch(err) {
    document.getElementById('error').value=String(err);
    document.getElementById('register').requestSubmit();
  }
}
