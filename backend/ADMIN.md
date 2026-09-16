# Administração de dispositivos

## Emitir chave

No editor do Apps Script, execute:

```javascript
issueDeviceToken('Nome do usuário', 'Android', 'Modelo do aparelho')
```

Copie a chave exibida no log. A chave em texto claro não é gravada na planilha; somente seu SHA-256.

## Revogar

```javascript
revokeDeviceToken('DEV-XXXXXXXX')
```

## Diagnóstico do PWA

No Chrome DevTools remoto, confirme:
- Service Worker ativo com escopo `/bracomil-share/`.
- Cache `bracomil-inbox-v2` criado ao compartilhar.
- O share target redireciona para `index.html?shared=1`.
- Não deve existir tentativa de registrar o Service Worker com escopo `/`.
