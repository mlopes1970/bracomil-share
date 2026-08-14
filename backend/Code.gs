const CONFIG = {
  SHEET_ID: '142g4y6HhMkWokdieU3LYQyz3fjkQMLVDi7W-D2kc73A',
  SHEET_NAME: 'Registros',
  DRIVE_FOLDER_ID: '1d1j7MHwHSGjdFDnY7TD_YRXYG5Awxsqo'
};

function doGet() {
  return HtmlService.createHtmlOutput('BRACOMIL Share API ativa.');
}

function doPost(e) {
  try {
    const p = e.parameter || {};
    if (!p.base64 || !p.fileName) throw new Error('Arquivo ausente.');

    const bytes = Utilities.base64Decode(p.base64);
    const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', sanitize_(p.fileName));
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);

    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
    ensureHeaders_(sheet);

    const now = new Date();
    const id = Utilities.getUuid();
    sheet.appendRow([
      id,
      now,
      p.party || '',
      p.category || '',
      p.notes || '',
      file.getName(),
      file.getMimeType(),
      file.getSize(),
      file.getUrl(),
      'WhatsApp / Android Share'
    ]);

    return response_('ok', 'Documento salvo com sucesso.');
  } catch (err) {
    console.error(err);
    return response_('error', err.message);
  }
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'ID','Data/Hora','Cliente/Fornecedor','Categoria','Observação',
      'Arquivo','MIME','Tamanho (bytes)','Link Drive','Origem'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,10).setFontWeight('bold');
  }
}

function sanitize_(name) {
  return String(name).replace(/[\\/:*?\"<>|]/g, '_').slice(0,180);
}


function response_(status, message) {
  const payload = JSON.stringify({ source: 'bracomil-share', status: status, message: message });
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><body><script>' +
    'window.parent.postMessage(' + JSON.stringify(payload) + ', "*");' +
    '</script></body></html>'
  );
}
