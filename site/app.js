const CACHE = 'bracomil-share-v7';
const TOKEN_KEY = 'bracomil_app_token_v1';

const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzV4vxOpMC68i_pw1RlrBpJ92GRkdKKtKAJepTreGE330_fKpJFnEI5w9uVWCFTM9l-Zw/exec'
};

const fileInput = document.querySelector('#fileInput');
const form = document.querySelector('#docForm');
const statusEl = document.querySelector('#status');
const fileInfo = document.querySelector('#fileInfo');
const preview = document.querySelector('#preview');
const sendButton = document.querySelector('#sendButton');
const uploadFrame = document.querySelector('#uploadFrame');

const successModal = document.querySelector('#successModal');
const successOk = document.querySelector('#successOk');
const tokenModal = document.querySelector('#tokenModal');
const tokenButton = document.querySelector('#tokenButton');
const tokenInput = document.querySelector('#tokenInput');
const tokenSave = document.querySelector('#tokenSave');
const tokenCancel = document.querySelector('#tokenCancel');

let activeFile = null;
let uploadPending = false;
let uploadStartedAt = 0;
let uploadTimeoutId = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function openTokenModal() {
  tokenInput.value = getToken();
  tokenModal.hidden = false;
  setTimeout(() => tokenInput.focus(), 50);
}

function closeTokenModal() {
  tokenModal.hidden = true;
}

tokenButton.addEventListener('click', openTokenModal);

tokenSave.addEventListener('click', () => {
  const token = tokenInput.value.trim();

  if (!token) {
    alert('Informe uma chave válida.');
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
  closeTokenModal();
});

tokenCancel.addEventListener('click', closeTokenModal);

function setFile(file) {
  activeFile = file || null;

  if (!activeFile) {
    fileInfo.textContent = 'Nenhum arquivo selecionado.';
    preview.hidden = true;
    preview.removeAttribute('src');
    return;
  }

  fileInfo.textContent =
    `${activeFile.name} • ${(activeFile.size / 1024 / 1024).toFixed(2)} MB`;

  if (activeFile.type.startsWith('image/')) {
    preview.src = URL.createObjectURL(activeFile);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }
}

function resetSendingState() {
  uploadPending = false;

  if (uploadTimeoutId) {
    clearTimeout(uploadTimeoutId);
    uploadTimeoutId = null;
  }

  sendButton.disabled = false;
  sendButton.textContent = 'ENVIAR';
}

function showSuccess() {
  resetSendingState();
  statusEl.textContent = '';
  successModal.hidden = false;
}

successOk.addEventListener('click', () => {
  successModal.hidden = true;
  form.reset();
  setFile(null);
});

function finishError(message) {
  resetSendingState();
  statusEl.className = 'err';
  statusEl.textContent =
    message || 'Não foi possível concluir o envio.';
}

fileInput.addEventListener(
  'change',
  () => setFile(fileInput.files[0])
);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () =>
      resolve(String(r.result).split(',')[1]);

    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function recoverSharedFile() {
  if (!('serviceWorker' in navigator)) return;

  await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;

  const url = new URL(location.href);

  if (url.searchParams.get('shared') !== '1') return;

  const cache = await caches.open(CACHE);
  const response = await cache.match('./__shared_file__');

  if (response) {
    const blob = await response.blob();
    const raw = response.headers.get('X-Shared-File-Name');
    const name = raw
      ? decodeURIComponent(raw)
      : `whatsapp-${Date.now()}`;

    setFile(
      new File(
        [blob],
        name,
        { type: blob.type || 'application/octet-stream' }
      )
    );

    await cache.delete('./__shared_file__');
  }

  history.replaceState({}, '', './index.html');
}

recoverSharedFile().catch(err => console.error(err));

if (!getToken()) {
  openTokenModal();
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();

  statusEl.className = '';
  statusEl.textContent = '';

  const token = getToken();

  if (!token) {
    openTokenModal();
    return;
  }

  if (!activeFile) {
    finishError('Selecione ou compartilhe um arquivo.');
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = 'ENVIANDO…';

  uploadPending = true;
  uploadStartedAt = Date.now();

  try {
    const base64 = await fileToBase64(activeFile);

    document.querySelector('#uploadForm').action =
      CONFIG.APPS_SCRIPT_URL;

    document.querySelector('#upToken').value = token;

    document.querySelector('#upParty').value =
      document.querySelector('#party').value.trim();

    document.querySelector('#upCategory').value =
      document.querySelector('#category').value;

    const documentNumber =
      document.querySelector('#numero_documento').value.trim() || '0';

    document.querySelector('#upDocumentNumber').value =
      documentNumber;

    document.querySelector('#upNotes').value =
      document.querySelector('#notes').value.trim();

    document.querySelector('#upFileName').value =
      activeFile.name;

    document.querySelector('#upMimeType').value =
      activeFile.type || 'application/octet-stream';

    document.querySelector('#upBase64').value = base64;

    document.querySelector('#uploadForm').submit();

    statusEl.textContent = 'Enviando para o Google Drive…';

    uploadTimeoutId = setTimeout(() => {
      if (uploadPending) {
        finishError(
          'O envio foi iniciado, mas a confirmação demorou demais. Verifique a planilha antes de reenviar para evitar duplicidade.'
        );
      }
    }, 30000);
  } catch (err) {
    console.error(err);
    finishError('Não foi possível preparar o arquivo para envio.');
  }
});

window.addEventListener('message', (event) => {
  let data = event.data;

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }

  if (!data || data.source !== 'bracomil-share') return;

  if (data.status === 'ok') {
    showSuccess();
    return;
  }

  if (data.status === 'duplicate') {
    resetSendingState();
    statusEl.className = 'err';
    statusEl.textContent =
      'ARQUIVO JÁ ENVIADO. Nenhuma cópia foi criada.';

    alert(
      'ARQUIVO JÁ ENVIADO!\n\n' +
      (data.existingFileName || 'Este documento já consta no sistema.')
    );
    return;
  }

  if ((data.message || '').toLowerCase().includes('token')) {
    localStorage.removeItem(TOKEN_KEY);
    finishError('Chave inválida ou revogada. Configure novamente.');
    openTokenModal();
    return;
  }

  finishError(
    'Falha ao salvar: ' +
    (data.message || 'erro não identificado')
  );
});

uploadFrame.addEventListener('load', () => {
  // O carregamento do iframe não é prova de sucesso.
  // Somente o postMessage do backend com status=ok abre o popup.
});
