# BRACOMIL Share

PWA para compartilhar imagens e PDFs do WhatsApp/Android diretamente para o fluxo documental da Bracomil.

## Fluxo

WhatsApp → Compartilhar → BRACOMIL → preencher Cliente/Fornecedor e Categoria → Enviar → Google Apps Script → Google Drive + Google Sheets.

## Estrutura

- `site/`: PWA publicada no GitHub Pages.
- `backend/Code.gs`: referência do backend já implantado no Google Apps Script.
- `.github/workflows/pages.yml`: publicação automática no GitHub Pages.

## Backend configurado

A PWA aponta para o Web App do Google Apps Script já informado pelo proprietário. A URL está em `site/app.js`.

## GitHub Pages

O workflow publica o conteúdo de `site/` a cada push na branch `main`. No GitHub, configure Pages com **Source: GitHub Actions** se o repositório ainda não estiver habilitado para Pages.

## Instalação no Android

Abra o endereço do GitHub Pages no Chrome, use **Instalar app** / **Adicionar à tela inicial** e conclua a instalação. Após a instalação, o manifesto registra a PWA como destino de compartilhamento para imagens e PDFs compatíveis.
