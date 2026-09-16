# Bracomil Share PWA

PWA para receber comprovantes compartilhados pelo WhatsApp/Android, coletar os dados comerciais e enviar o registro para Google Apps Script + Google Drive + Google Sheets.

## Estrutura

- `site/`: GitHub Pages / PWA.
- `backend/Code.gs`: backend Google Apps Script.
- `.github/workflows/pages.yml`: publicação do diretório `site/`.

## Versão desta revisão

`v19`

Principais correções:
- Service Worker sem `scope` manual inválido.
- Web Share Target em `./share-target`.
- Inbox de compartilhamento separado do cache do app.
- Chave absoluta e determinística do arquivo compartilhado.
- Verificação de `cache.put()` antes do redirect.
- Navegação `network-first` para evitar HTML antigo preso em cache.
- Assets com cache e atualização em background.
- `Valor` obrigatório para todas as formas de pagamento.
- Arquivo opcional apenas em `Espécie`.
- Remoção do iframe/formulário legado de upload.
- Backend preparado para registros sem arquivo em espécie.
- Migração da aba `Registros` para 18 colunas.

## Publicação

O workflow publica `site/` no GitHub Pages.

Depois de atualizar `backend/Code.gs`, publique uma **nova versão da implantação existente** no Apps Script para preservar a URL `/exec`.
