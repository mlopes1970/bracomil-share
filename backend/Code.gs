const CONFIG = {
  SHEET_ID: '142g4y6HhMkWokdieU3LYQyz3fjkQMLVDi7W-D2kc73A',
  RECORDS_SHEET: 'Registros',
  DEVICES_SHEET: 'Dispositivos',
  LOGS_SHEET: 'Logs de Desenvolvedor',
  DRIVE_FOLDER_ID: '1d1j7MHwHSGjdFDnY7TD_YRXYG5Awxsqo',
  TIMEZONE: 'America/Fortaleza'
};

const RECORD_HEADERS = [
  'ID',
  'Data/Hora',
  'Cliente/Fornecedor',
  'Origem do comprovante',
  'Identificador',
  'Forma de Pagamento',
  'Valor',
  'Observação',
  'Arquivo',
  'MIME',
  'Tamanho (bytes)',
  'Link Drive',
  'Origem',
  'SHA-256',
  'Usuário',
  'Plataforma',
  'Dispositivo',
  'Token ID'
];

const DEVICE_HEADERS = [
  'Token ID',
  'Usuário',
  'Plataforma',
  'Dispositivo',
  'Token SHA-256',
  'Ativo',
  'Criado em',
  'Último uso'
];

const LOGS_HEADER = [
  'Data',
  'Request ID',
  'Source',
  'Status',
  'Message',
  'Extra'
]

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (String(p.action || '').toLowerCase() === 'status') {
    return statusResponse_(p);
  }

  return HtmlService
    .createHtmlOutput('BRACOMIL Share API v2.2 ativa.')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const client = String(p.client || 'web').toLowerCase();
  const requestId = normalizeRequestId_(p.requestId);

  try {
    const device = validateDeviceToken_(p.appToken);

    if (String(p.action || '').toLowerCase() === 'ping') {
      touchDevice_(device.row);
      return response_(client, 'ok', 'Token válido.', {
        user: device.user,
        platform: device.platform,
        device: device.device,
        tokenId: device.tokenId
      });
    }

    const paymentMethod = String(p.paymentMethod || '').trim();
    if (!paymentMethod) {
      throw new Error('Forma de Pagamento obrigatória.');
    }

    const isCash = (paymentMethod === 'Espécie');

    if (!isCash && (!p.base64 || !p.fileName)) {
      throw new Error('Arquivo obrigatório para esta forma de pagamento.');
    }

    if (!p.party || !String(p.party).trim()) {
      throw new Error('Cliente / Fornecedor obrigatório.');
    }

    if (!p.category || !String(p.category).trim()) {
      throw new Error('Categoria obrigatória.');
    }

    let amount = String(p.amount || '').trim();
    if (paymentMethod === 'Espécie') {
      if (!amount) {
        throw new Error('Valor obrigatório para pagamento em espécie.');
      }

      amount = parseBrazilianAmount_(p.amount);
      if (amount <= 0) {
        throw new Error('O valor deve ser maior que zero.');
      }
    } else {
      amount = '';
    }

    const hasFile = Boolean(p.base64 && p.fileName);

    let bytes = null;
    let fileHash = '';

    if (hasFile) {
      bytes = Utilities.base64Decode(p.base64);
      fileHash = sha256Hex_(bytes);
    }

    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const records = getOrCreateSheet_(ss, CONFIG.RECORDS_SHEET, RECORD_HEADERS);
    ensureRecordSchema_(records);

    let duplicate = null;
    if (hasFile) {
      duplicate = findDuplicate_(records, fileHash);
    }

    if (duplicate) {
      touchDevice_(device.row);

      const duplicatePayload = {
        existingId: duplicate.id,
        existingFileName: duplicate.fileName,
        existingUrl: duplicate.url,
        hash: fileHash
      };

      cacheReceipt_(
        requestId,
        'duplicate',
        'Este arquivo já foi enviado anteriormente.',
        duplicatePayload
      );

      return response_(
        client,
        'duplicate',
        'Este arquivo já foi enviado anteriormente.',
        duplicatePayload
      );
    }

    const party = String(p.party).trim();
    const category = String(p.category).trim();
    const documentNumber = String(p.numero_documento || p.documentNumber || '').trim() || '0';

    let file = null
    const now = new Date();
    if (hasFile) {
      const mimeType = p.mimeType || 'application/octet-stream';
      const extension = extensionFor_(p.fileName, mimeType);

      const fileName = buildFileName_(now, party, category, fileHash, extension);
      const destinationFolder = getDestinationFolder_(now);
      const blob = Utilities.newBlob(bytes, mimeType, fileName);
      file = destinationFolder.createFile(blob);
    }

    const id = Utilities.getUuid();
    const origin = device.platform === 'iOS'
      ? 'iPhone / iOS Share Extension'
      : 'WhatsApp / Android Share';

    records.appendRow([
      id,
      now,
      party,
      category,
      documentNumber,
      paymentMethod,
      amount,
      p.notes || '',
      file ? file.getName() : '',
      file ? file.getMimeType() : '',
      file ? file.getSize() : '',
      file ? file.getUrl() : '',
      origin,
      fileHash,
      device.user,
      device.platform,
      device.device,
      device.tokenId
    ]);

    SpreadsheetApp.flush();
    touchDevice_(device.row);

    const successPayload = {
      id: id,
      fileName: file ? file.getName() : '',
      fileUrl: file ? file.getUrl() : '',
      hash: fileHash,
      user: device.user,
      platform: device.platform,
      device: device.device
    };

    cacheReceipt_(requestId, 'ok', 'Documento salvo com sucesso.', successPayload);

    return response_(client, 'ok', 'Documento salvo com sucesso.', successPayload);

  } catch (err) {
    console.error(err);
    const errorMessage = err && err.message ? err.message : String(err);
    cacheReceipt_(requestId, 'error', errorMessage);
    return response_(client, 'error', errorMessage);
  }
}

function normalizeRequestId_(value) {
  const id = String(value || '').trim();

  if (!id) return '';

  if (!/^[A-Za-z0-9._-]{8,120}$/.test(id)) {
    return '';
  }

  return id;
}

function cacheReceipt_(requestId, status, message, extra) {
  if (!requestId) return;

  const payload = Object.assign({
    source: 'bracomil-share',
    status: status,
    message: message
  }, extra || {});

  CacheService
    .getScriptCache()
    .put(
      'receipt:' + requestId,
      JSON.stringify(payload),
      600
    );

  // Add permanently in Sheet
  const logs = getOrCreateSheet_(ss, CONFIG.LOGS_SHEET, LOGS_HEADER);
  ensureHeaders_(logs, LOGS_HEADER);

  logs.appendRow([
    new Date(),         // Data
    requestId,          // Request ID
    "bracomil-share",   // Source
    status,             // Status
    message,            // Message
    extra,              // Extra
  ]);
}

function statusResponse_(p) {
  const requestId = normalizeRequestId_(p.requestId);
  const callback = String(p.callback || '').trim();

  if (!requestId) {
    return javascriptResponse_(
      callback,
      {
        source: 'bracomil-share',
        status: 'error',
        message: 'ID de requisição inválido.'
      }
    );
  }

  const raw = CacheService
    .getScriptCache()
    .get('receipt:' + requestId);

  let payload;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      payload = {
        source: 'bracomil-share',
        status: 'error',
        message: 'Recibo inválido.'
      };
    }
  } else {
    payload = {
      source: 'bracomil-share',
      status: 'pending',
      message: 'Processando...'
    };
  }

  return javascriptResponse_(callback, payload);
}

function javascriptResponse_(callback, payload) {
  const validCallback =
    /^[A-Za-z_$][0-9A-Za-z_$]{0,80}$/.test(callback);

  if (!validCallback) {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(
      callback + '(' + JSON.stringify(payload) + ');'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * ADMIN: cria um token individual para um aparelho.
 *
 * Exemplo:
 *   issueDeviceToken('Marcelo Lopes', 'Android', 'Galaxy S24')
 *
 * Rode pelo editor do Apps Script. O token completo aparece no log
 * apenas nessa emissão e NÃO é salvo em claro na planilha.
 */
function issueDeviceToken(user, platform, deviceName) {
  if (!user || !platform || !deviceName) {
    throw new Error('Informe usuário, plataforma e dispositivo.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const devices = getOrCreateSheet_(ss, CONFIG.DEVICES_SHEET, DEVICE_HEADERS);
  ensureHeaders_(devices, DEVICE_HEADERS);

  const tokenId = 'DEV-' + Utilities.getUuid().split('-')[0].toUpperCase();
  const rawToken =
    'BRACOMIL.' +
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');

  const tokenHash = sha256Text_(rawToken);
  const now = new Date();

  devices.appendRow([
    tokenId,
    String(user).trim(),
    normalizePlatform_(platform),
    String(deviceName).trim(),
    tokenHash,
    true,
    now,
    ''
  ]);

  SpreadsheetApp.flush();

  console.log('TOKEN ID: ' + tokenId);
  console.log('USUÁRIO: ' + user);
  console.log('PLATAFORMA: ' + normalizePlatform_(platform));
  console.log('DISPOSITIVO: ' + deviceName);
  console.log('TOKEN (copie agora): ' + rawToken);

  return {
    tokenId: tokenId,
    token: rawToken
  };
}

/**
 * ADMIN: revoga um dispositivo sem afetar os demais.
 *
 * Exemplo:
 *   revokeDeviceToken('DEV-ABC12345')
 */
function revokeDeviceToken(tokenId) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const devices = getOrCreateSheet_(ss, CONFIG.DEVICES_SHEET, DEVICE_HEADERS);
  ensureHeaders_(devices, DEVICE_HEADERS);

  const lastRow = devices.getLastRow();
  if (lastRow < 2) throw new Error('Nenhum dispositivo cadastrado.');

  const values = devices.getRange(2, 1, lastRow - 1, DEVICE_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(tokenId)) {
      devices.getRange(i + 2, 6).setValue(false);
      SpreadsheetApp.flush();
      return 'Token revogado: ' + tokenId;
    }
  }

  throw new Error('Token ID não encontrado.');
}

function validateDeviceToken_(rawToken) {
  const token = String(rawToken || '').trim();

  if (!token) {
    throw new Error('Token ausente.');
  }

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const devices = getOrCreateSheet_(ss, CONFIG.DEVICES_SHEET, DEVICE_HEADERS);
  ensureHeaders_(devices, DEVICE_HEADERS);

  const lastRow = devices.getLastRow();
  if (lastRow < 2) {
    throw new Error('Nenhum dispositivo autorizado.');
  }

  const tokenHash = sha256Text_(token);
  const values = devices
    .getRange(2, 1, lastRow - 1, DEVICE_HEADERS.length)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const active = row[5] === true || String(row[5]).toLowerCase() === 'true';

    if (active && safeEquals_(String(row[4]), tokenHash)) {
      return {
        row: i + 2,
        tokenId: String(row[0]),
        user: String(row[1]),
        platform: String(row[2]),
        device: String(row[3])
      };
    }
  }

  throw new Error('Token inválido ou revogado.');
}

function touchDevice_(rowNumber) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const devices = ss.getSheetByName(CONFIG.DEVICES_SHEET);

  if (devices && rowNumber >= 2) {
    devices.getRange(rowNumber, 8).setValue(new Date());
  }
}

function findDuplicate_(records, fileHash) {
  const lastRow = records.getLastRow();

  if (lastRow < 2) return null;

  // SHA-256 está na coluna L (14), após a inclusão de Nº Doc em E.
  const hashRange = records.getRange(2, 14, lastRow - 1, 1);
  const match = hashRange
    .createTextFinder(fileHash)
    .matchEntireCell(true)
    .findNext();

  if (!match) return null;

  const row = match.getRow();
  const values = records.getRange(row, 1, 1, RECORD_HEADERS.length).getValues()[0];

  return {
    id: values[0],
    fileName: values[8],
    url: values[11],
    row: row
  };
}

function getDestinationFolder_(date) {
  let folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const formattedDate = Utilities.formatDate(date, CONFIG.TIMEZONE, 'dd/MM/yyyy');
  const dateFolder = folderChild_(folder, formattedDate);

  return dateFolder;
}

function folderChild_(parent, name) {
  const existing = parent.getFoldersByName(name);

  if (existing.hasNext()) {
    return existing.next();
  }

  return parent.createFolder(name);
}

function buildFileName_(date, party, category, hash, extension) {
  const day = Utilities.formatDate(
    date,
    CONFIG.TIMEZONE,
    'yyyy-MM-dd_HHmmss'
  );

  const partyPart = filePart_(party).slice(0, 45);
  const categoryPart = filePart_(category).slice(0, 30);
  const hashPart = String(hash).slice(0, 8).toUpperCase();

  return [
    day,
    partyPart,
    categoryPart,
    hashPart
  ].join('_') + extension;
}

function extensionFor_(originalName, mimeType) {
  const name = String(originalName || '');
  const match = name.match(/(\.[A-Za-z0-9]{1,8})$/);

  if (match) {
    return match[1].toLowerCase();
  }

  const byMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
  };

  return byMime[String(mimeType || '').toLowerCase()] || '';
}

function folderName_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'SEM NOME';
}

function filePart_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'SEM-NOME';
}

function normalizePlatform_(platform) {
  const p = String(platform || '').trim().toLowerCase();

  if (p.indexOf('ios') >= 0 || p.indexOf('iphone') >= 0) {
    return 'iOS';
  }

  if (p.indexOf('android') >= 0) {
    return 'Android';
  }

  return String(platform).trim();
}

function getOrCreateSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const current = sheet
      .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
      .getValues()[0];

    for (let i = 0; i < headers.length; i++) {
      if (!current[i]) {
        sheet.getRange(1, i + 1).setValue(headers[i]);
      } else if (String(current[i]) !== headers[i]) {
        // Para Registros antigos, apenas completa as novas colunas K:O.
        if (i >= 10) {
          sheet.getRange(1, i + 1).setValue(headers[i]);
        }
      }
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
}

function ensureRecordSchema_(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (v) {
      return String(v || '').trim();
    });

  if (
    currentHeaders[4] === 'Nº Doc' &&
    currentHeaders[5] === 'Observação'
  ) {
    // Insere F e G, deslocando Observação e tudo após ela
    sheet.insertColumnsAfter(5, 2);
  }

  // Atualiza toda a linha de cabeçalho
  sheet
    .getRange(1, 1, 1, RECORD_HEADERS.length)
    .setValues([RECORD_HEADERS]);

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, RECORD_HEADERS.length)
    .setFontWeight('bold');

  // Mantém Identificador vazio como "0" nos registros antigos
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const range = sheet.getRange(
      2,
      5,
      lastRow - 1,
      1
    );

    const values = range.getValues();

    const normalized = values.map(function (row) {
      const value = String(row[0] == null ? '' : row[0]).trim();

      return [value || '0'];
    });

    range.setValues(normalized);
  }
}

function sha256Text_(text) {
  return sha256Hex_(
    Utilities.newBlob(String(text)).getBytes()
  );
}

function sha256Hex_(bytes) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes
  );

  return digest
    .map(function (b) {
      const v = (b + 256) % 256;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function safeEquals_(a, b) {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let i = 0; i < max; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }

  return diff === 0;
}

function response_(client, status, message, extra) {
  const payload = Object.assign({
    source: 'bracomil-share',
    status: status,
    message: message
  }, extra || {});

  if (client === 'ios') {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const serialized = JSON.stringify(payload);

  return HtmlService
    .createHtmlOutput(
      '<!doctype html><html><body><script>' +
      'window.parent.postMessage(' +
      JSON.stringify(serialized) +
      ', "*");' +
      '</script></body></html>'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Replaces R$ for nothing and . for , */
function parseBrazilianAmount_(value) {
  const text = String(value || '')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, ',')

  const number = Number(text);

  if (!Number.isFinite(number)) {
    throw new Error('Valor inválido.');
  }

  return number;
}