const CACHE = 'bracomil-share-v3';

const CONFIG = {
  // Após implantar Code.gs como Web App, cole aqui a URL que termina em /exec.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzV4vxOpMC68i_pw1RlrBpJ92GRkdKKtKAJepTreGE330_fKpJFnEI5w9uVWCFTM9l-Zw/exec'
};

const fileInput = document.querySelector('#fileInput');
const form = document.querySelector('#docForm');
const statusEl = document.querySelector('#status');
const fileInfo = document.querySelector('#fileInfo');
const preview = document.querySelector('#preview');
const sendButton = document.querySelector('#sendButton');
let activeFile = null;

function setFile(file){
  activeFile = file || null;
  if(!activeFile){
    fileInfo.textContent = 'Nenhum arquivo selecionado.';
    preview.hidden = true;
    return;
  }
  fileInfo.textContent = `${activeFile.name} • ${(activeFile.size/1024/1024).toFixed(2)} MB`;
  if(activeFile.type.startsWith('image/')){
    preview.src = URL.createObjectURL(activeFile);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }
}

fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function recoverSharedFile(){
  if(!('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;

  const url = new URL(location.href);
  if(url.searchParams.get('shared') !== '1') return;

  const cache = await caches.open(CACHE);
  const response = await cache.match('./__shared_file__');
  if(response){
    const blob = await response.blob();
    const name = response.headers.get('X-Shared-File-Name') || `whatsapp-${Date.now()}`;
    setFile(new File([blob], name, {type: blob.type || 'application/octet-stream'}));
    await cache.delete('./__shared_file__');
  }
  history.replaceState({}, '', './index.html');
}

recoverSharedFile().catch(err => console.error(err));

form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  statusEl.className='';
  statusEl.textContent='';

  if(!activeFile){
    statusEl.className='err';
    statusEl.textContent='Selecione ou compartilhe um arquivo.';
    return;
  }
  if(!CONFIG.APPS_SCRIPT_URL.startsWith('https://script.google.com/')){
    statusEl.className='err';
    statusEl.textContent='Falta configurar a URL do Apps Script em app.js.';
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = 'ENVIANDO…';
  try{
    const base64 = await fileToBase64(activeFile);
    document.querySelector('#uploadForm').action = CONFIG.APPS_SCRIPT_URL;
    document.querySelector('#upParty').value = document.querySelector('#party').value.trim();
    document.querySelector('#upCategory').value = document.querySelector('#category').value;
    document.querySelector('#upNotes').value = document.querySelector('#notes').value.trim();
    document.querySelector('#upFileName').value = activeFile.name;
    document.querySelector('#upMimeType').value = activeFile.type || 'application/octet-stream';
    document.querySelector('#upBase64').value = base64;
    document.querySelector('#uploadForm').submit();
    statusEl.textContent='Enviando para o Google Drive…';
  }catch(err){
    console.error(err);
    statusEl.className='err';
    statusEl.textContent='Não foi possível preparar o arquivo para envio.';
  }
});

window.addEventListener('message', (event) => {
  let data = event.data;
  if(typeof data === 'string'){
    try { data = JSON.parse(data); } catch { return; }
  }
  if(!data || data.source !== 'bracomil-share') return;

  sendButton.disabled = false;
  sendButton.textContent = 'ENVIAR';
  if(data.status === 'ok'){
    statusEl.className='ok';
    statusEl.textContent=data.message || 'Documento salvo com sucesso.';
    form.reset();
    setFile(null);
  } else {
    statusEl.className='err';
    statusEl.textContent='Falha ao salvar: ' + (data.message || 'erro não identificado');
  }
});
