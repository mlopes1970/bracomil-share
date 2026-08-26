const CACHE = 'bracomil-share-v12';
const SHARE_INBOX_CACHE = 'bracomil-inbox-v1';

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

const paymentMethod = document.querySelector('#paymentMethod');
const amountField = document.querySelector('#amountField');
const amountInput = document.querySelector('#amount');

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
let receiptPollTimer = null;
let activeRequestId = '';
let activeReceiptScript = null;

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

  stopReceiptPolling();

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

function createRequestId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }

  return (
    'req-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

function stopReceiptPolling() {
  activeRequestId = '';

  if (receiptPollTimer) {
    clearTimeout(receiptPollTimer);
    receiptPollTimer = null;
  }

  if (activeReceiptScript) {
    activeReceiptScript.remove();
    activeReceiptScript = null;
  }
}

function startReceiptPolling(requestId) {
  activeRequestId = requestId;

  const poll = () => {
    if (!uploadPending || activeRequestId !== requestId) {
      return;
    }

    checkReceipt(requestId, poll);
  };

  receiptPollTimer = setTimeout(poll, 1000);
}

function checkReceipt(requestId, retry) {
  const callbackName =
    '__bracomilReceipt_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);

  const script = document.createElement('script');
  activeReceiptScript = script;

  let completed = false;

  const cleanup = () => {
    if (completed) return;
    completed = true;

    try {
      delete window[callbackName];
    } catch {
      window[callbackName] = undefined;
    }

    script.remove();

    if (activeReceiptScript === script) {
      activeReceiptScript = null;
    }
  };

  window[callbackName] = (data) => {
    cleanup();

    if (!uploadPending || activeRequestId !== requestId) {
      return;
    }

    if (!data || data.source !== 'bracomil-share') {
      receiptPollTimer = setTimeout(retry, 1500);
      return;
    }

    if (data.status === 'pending') {
      statusEl.textContent =
        'Arquivo recebido. Aguardando confirmação do servidor…';

      receiptPollTimer = setTimeout(retry, 1500);
      return;
    }

    handleServerResult(data);
  };

  script.onerror = () => {
    cleanup();

    if (uploadPending && activeRequestId === requestId) {
      receiptPollTimer = setTimeout(retry, 2000);
    }
  };

  const statusUrl = new URL(CONFIG.APPS_SCRIPT_URL);

  statusUrl.searchParams.set('action', 'status');
  statusUrl.searchParams.set('requestId', requestId);
  statusUrl.searchParams.set('callback', callbackName);
  statusUrl.searchParams.set('_', Date.now().toString());

  script.src = statusUrl.toString();
  document.head.appendChild(script);
}

function handleServerResult(data) {
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
      (
        data.existingFileName ||
        'Este documento já consta no sistema.'
      )
    );
    return;
  }

  if (data.status === 'error') {
    if ((data.message || '').toLowerCase().includes('token')) {
      localStorage.removeItem(TOKEN_KEY);
      finishError(
        'Chave inválida ou revogada. Configure novamente.'
      );
      openTokenModal();
      return;
    }

    finishError(
      'Falha ao salvar: ' +
      (data.message || 'erro não identificado')
    );
  }
}

async function postDirectly(fields) {
  const body = new URLSearchParams();

  Object.entries(fields).forEach(([key, value]) => {
    body.set(key, value == null ? '' : String(value));
  });

  // Apps Script não fornece CORS para leitura da resposta.
  // mode=no-cors permite enviar o POST; a confirmação real
  // continua sendo obtida pelo recibo consultado por requestId.
  await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    credentials: 'omit',
    cache: 'no-store',
    body
  });
}

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

  const cache = await caches.open(SHARE_INBOX_CACHE);
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

    const party =
      document.querySelector('#party').value.trim();

    const category =
      document.querySelector('#category').value;

    const documentNumber =
      document.querySelector('#numero_documento').value.trim() || '0';

    const notes =
      document.querySelector('#notes').value.trim();

    const requestId = createRequestId();

    startReceiptPolling(requestId);

    statusEl.textContent = 'Enviando para o Google Drive…';

    const paymentMethod = document.querySelector('#paymentMethod').value;

    const amount = document.querySelector('#amount').value.trim();

    if (!paymentMethod) {
      finishError('Informe a forma de pagamento.');
      return;
    }

    if (paymentMethod === 'Espécie' && !amount) {
      finishError('Informe o valor recebido em espécie.');
      return;
    }

    await postDirectly({
      client: 'web',
      requestId,
      appToken: token,
      party,
      category,
      numero_documento: documentNumber,
      paymentMethod,
      amount,
      notes,
      fileName: activeFile.name,
      mimeType:
        activeFile.type || 'application/octet-stream',
      base64
    });

    statusEl.textContent =
      'Arquivo transmitido. Aguardando confirmação do servidor…';

    uploadTimeoutId = setTimeout(() => {
      if (uploadPending) {
        finishError(
          'O servidor não confirmou o processamento. Não reenvie ainda; verifique a planilha para evitar duplicidade.'
        );
      }
    }, 60000);
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

  handleServerResult(data);
});

uploadFrame.addEventListener('load', () => {
  // O carregamento do iframe não é prova de sucesso.
  // Somente o postMessage do backend com status=ok abre o popup.
});

function updateAmountVisibility() {
  const isCash = paymentMethod.value === 'Espécie';

  amountField.hidden = !isCash;
  amountInput.required = isCash;

  if (!isCash) {
    amountInput.value = '';
  }
}

paymentMethod.addEventListener(
  'change',
  updateAmountVisibility
);

updateAmountVisibility();