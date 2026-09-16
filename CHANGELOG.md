# CHANGELOG

## v19

### PWA
- Corrige registro do Service Worker removendo `scope: '/'`.
- Mantém escopo padrão `/bracomil-share/`.
- Share Target padronizado em `./share-target`.
- Aceita `/share-target` e `/share-target/` no SW para compatibilidade.
- Inbox migrado para `bracomil-inbox-v2`.
- Usa chave absoluta derivada do `registration.scope`.
- Confirma a persistência do arquivo antes de redirecionar.
- Navegações usam network-first.
- Remove iframe/formulário legado.
- Valor sempre visível e obrigatório.
- Arquivo opcional apenas para Espécie.
- Mensagens de diagnóstico mais claras.

### Backend
- Valor obrigatório para todas as formas de pagamento.
- Corrige parsing de moeda brasileira.
- Permite Espécie sem arquivo.
- Corrige índices do SHA/arquivo/link no schema novo.
- Migração segura para as colunas Forma de Pagamento e Valor.
- Evita `file.getName()` quando não existe arquivo.
