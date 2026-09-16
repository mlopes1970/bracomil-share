const APP_VERSION = '19';
const CACHE = 'bracomil-share-v19';
const SHARE_INBOX_CACHE = 'bracomil-inbox-v2';
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

const paymentMethodSelect = document.querySelector('#paymentMethod');
const amountInput = document.querySelector('#amount');

const successModal = document.querySelector('#successModal');
const successOk = document.querySelector('#successOk');
const tokenModal = document.querySelector('#tokenModal');
const tokenButton = document.querySelector('#tokenButton');
const tokenInput = document.querySelector('#tokenInput');
const tokenSave = document.querySelector('#tokenSave');
const tokenCancel = document.querySelector('#tokenCancel');
const appVersion = document.querySelector('#appVersion');

let activeFile = null;
let activePreviewUrl = '';
let uploadPending = false;
let uploadTimeoutId = null;
let receiptPollTimer = null;
let activeRequestId = '';
let activeReceiptScript = null;

appVersion.textContent = `v${APP_VERSION}`;

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
  if (activePreviewUrl) {
    URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = '';
  }

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
    activePreviewUrl = URL.createObjectURL(activeFile);
    preview.src = activePreviewUrl;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute('src');
  }
}

fileInput.addEventListener('change', () => {
  setFile(fileInput.files?.[0] || null);
});

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
  statusEl.className = '';
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

  window[callbackName] = data => {
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
        'Dados recebidos. Aguardando confirmação do servidor…';
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
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');

      if (comma < 0) {
        reject(new Error('Não foi possível converter o arquivo.'));
        return;
      }

      resolve(result.slice(comma + 1));
    };

    reader.onerror = () =>
      reject(reader.error || new Error('Falha ao ler o arquivo.'));

    reader.readAsDataURL(file);
  });
}

function sharedInboxKey() {
  // index.html e sw.js vivem no mesmo diretório de escopo da PWA.
  return new URL('./__shared_file__', document.baseURI).href;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este navegador não suporta Service Worker.');
  }

  // Não definir scope manualmente.
  // Como sw.js está em /bracomil-share/, o escopo padrão correto é
  // automaticamente /bracomil-share/.
  const registration =
    await navigator.serviceWorker.register('./sw.js?v=19');

  await navigator.serviceWorker.ready;

  return registration;
}

async function recoverSharedFile() {
  const url = new URL(location.href);
  const shareError = url.searchParams.get('share_error');

  if (shareError) {
    finishError(
      'O Android abriu o compartilhamento, mas o arquivo não pôde ser armazenado localmente. Código: ' +
      shareError
    );
    history.replaceState({}, '', './index.html');
    return;
  }

  if (url.searchParams.get('shared') !== '1') {
    return;
  }

  const existingCaches = await caches.keys();

  if (!existingCaches.includes(SHARE_INBOX_CACHE)) {
    finishError(
      'O compartilhamento foi recebido, mas a caixa de entrada local não existe. Abra novamente pelo WhatsApp.'
    );
    history.replaceState({}, '', './index.html');
    return;
  }

  const cache = await caches.open(SHARE_INBOX_CACHE);
  const key = sharedInboxKey();
  const response = await cache.match(key);

  if (!response) {
    const knownRequests = await cache.keys();
    console.error(
      '[BRACOMIL] Arquivo não encontrado no inbox.',
      {
        expected: key,
        entries: knownRequests.map(item => item.url)
      }
    );

    finishError(
      'O compartilhamento chegou ao aplicativo, mas o arquivo não foi localizado no armazenamento local.'
    );
    history.replaceState({}, '', './index.html');
    return;
  }

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

  // Apaga somente depois de materializar o Blob em memória.
  await cache.delete(key);

  history.replaceState({}, '', './index.html');
}

async function boot() {
  try {
    await registerServiceWorker();
  } catch (err) {
    console.error('[BRACOMIL] Erro ao registrar Service Worker:', err);
    finishError(
      'Não foi possível ativar o compartilhamento do aplicativo. Feche e abra novamente. ' +
      (err?.message || '')
    );
    return;
  }

  await recoverSharedFile();

  if (!getToken()) {
    openTokenModal();
  }
}

form.addEventListener('submit', async ev => {
  ev.preventDefault();

  statusEl.className = '';
  statusEl.textContent = '';

  const token = getToken();

  if (!token) {
    openTokenModal();
    return;
  }

  const party =
    document.querySelector('#party').value.trim();

  const category =
    document.querySelector('#category').value;

  const documentNumber =
    document.querySelector('#numero_documento').value.trim() || '0';

  const selectedPaymentMethod =
    paymentMethodSelect.value;

  const amount =
    amountInput.value.trim();

  const notes =
    document.querySelector('#notes').value.trim();

  if (!party) {
    finishError('Informe o cliente / fornecedor.');
    return;
  }

  if (!category) {
    finishError('Informe a origem do comprovante.');
    return;
  }

  if (!selectedPaymentMethod) {
    finishError('Informe a forma de pagamento.');
    return;
  }

  if (!amount) {
    finishError('Informe o valor.');
    return;
  }

  const isCash =
    selectedPaymentMethod === 'Espécie';

  if (!isCash && !activeFile) {
    finishError(
      'Selecione ou compartilhe o comprovante.'
    );
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = 'ENVIANDO…';

  uploadPending = true;

  try {
    let base64 = '';
    let fileName = '';
    let mimeType = '';

    if (activeFile) {
      base64 = await fileToBase64(activeFile);
      fileName = activeFile.name;
      mimeType =
        activeFile.type || 'application/octet-stream';
    }

    const requestId = createRequestId();

    startReceiptPolling(requestId);

    statusEl.textContent =
      'Enviando para o Google Drive…';

    await postDirectly({
      client: 'web',
      requestId,
      appToken: token,
      party,
      category,
      numero_documento: documentNumber,
      paymentMethod: selectedPaymentMethod,
      amount,
      notes,
      fileName,
      mimeType,
      base64
    });

    statusEl.textContent =
      'Dados transmitidos. Aguardando confirmação do servidor…';

    uploadTimeoutId = setTimeout(() => {
      if (uploadPending) {
        finishError(
          'O servidor não confirmou o processamento. Não reenvie ainda; verifique a planilha para evitar duplicidade.'
        );
      }
    }, 60000);
  } catch (err) {
    console.error(err);
    finishError(
      'Não foi possível preparar ou transmitir o registro.'
    );
  }
});

window.addEventListener('online', () => {
  statusEl.className = '';
  statusEl.textContent = '';
});

window.addEventListener('offline', () => {
  statusEl.className = 'err';
  statusEl.textContent =
    'Sem conexão com a internet. O envio ao servidor não poderá ser concluído.';
});

boot().catch(err => {
  console.error('[BRACOMIL] Erro na inicialização:', err);
  finishError('Falha ao iniciar o aplicativo.');
});
