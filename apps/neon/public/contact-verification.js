(() => {
  const proof = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const button = document.getElementById('confirm');
  const result = document.getElementById('result');
  const [id, token, extra] = proof.split('.');
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !/^[A-Za-z0-9_-]{43}$/.test(token || '') || extra) {
    button.disabled = true; result.textContent = 'This verification link is invalid. Request a new link.'; return;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const cookies = Object.fromEntries(document.cookie.split(';').map(item => { const index = item.indexOf('='); return [item.slice(0,index).trim(),item.slice(index+1)]; }));
      const csrf = cookies['__Host-athyper-csrf'] || cookies['athyper-csrf'];
      const response = await fetch('/api/relay/master/verification-challenges/'+id+'/complete', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json', ...(csrf ? {'X-CSRF-Token':decodeURIComponent(csrf)} : {})}, body:JSON.stringify({token}),
      });
      const body = await response.json();
      result.textContent = response.ok ? 'Your contact email is verified.' : 'Verification could not be completed: '+(body.code || response.status)+'. Sign in as the requester or request a new link.';
    } catch { result.textContent = 'Unable to reach the verification service. Try again.'; }
    finally { button.disabled = false; }
  });
})();
