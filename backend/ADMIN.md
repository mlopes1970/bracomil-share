# Administração — BRACOMIL Share v2

## O que mudou

Esta versão implementa:

1. Nome automático de arquivo.
2. Pastas automáticas por Cliente/Fornecedor → Ano → Categoria.
3. Registro confiável de usuário, plataforma e dispositivo.
4. Token individual e revogável por aparelho.
5. Bloqueio de arquivo duplicado por SHA-256.

## Campo obrigatório: Nº Doc

O formulário agora possui `Nº Doc` (`numero_documento`) entre **Categoria** e **Observação**.

- É obrigatório nas interfaces.
- Quando não existir número do documento, use `0`.
- O backend normaliza campo vazio/ausente para `0`.
- Registros históricos recebem `0` durante a migração.
- Na planilha `Registros`, o campo ocupa a coluna **E**.

## 1. Atualizar o backend

Substitua o `Code.gs` do Apps Script pelo arquivo deste pacote e publique uma **nova versão** da implantação existente.

O endpoint permanece:

`https://script.google.com/macros/s/AKfycbzV4vxOpMC68i_pw1RlrBpJ92GRkdKKtKAJepTreGE330_fKpJFnEI5w9uVWCFTM9l-Zw/exec`

## 2. Emitir token para cada aparelho

No editor do Apps Script, execute manualmente:

```javascript
issueDeviceToken('Marcelo Lopes', 'Android', 'Galaxy S24')
```

ou:

```javascript
issueDeviceToken('Marcelo Lopes', 'iOS', 'iPhone 16 Pro')
```

Abra **Executions / Logs** e copie o token gerado.

O token completo aparece somente no momento da emissão. A aba `Dispositivos` guarda apenas SHA-256.

### Colunas criadas na aba `Dispositivos`

- Token ID
- Usuário
- Plataforma
- Dispositivo
- Token SHA-256
- Ativo
- Criado em
- Último uso

## 3. Revogar um aparelho

Execute:

```javascript
revokeDeviceToken('DEV-ABC12345')
```

O aparelho perde acesso imediatamente sem trocar os tokens dos outros dispositivos.

## 4. Estrutura automática no Drive

A pasta atual `ARQUIVOS RECEBIDOS` passa a conter:

```text
ARQUIVOS RECEBIDOS/
  CLIENTE OU FORNECEDOR/
    2026/
      Comprovante/
      Nota fiscal/
      Pedido/
      Foto/
      Documento/
      Outros/
```

## 5. Nome automático

Padrão:

```text
AAAA-MM-DD_HHMMSS_CLIENTE_CATEGORIA_HASH8.ext
```

Exemplo:

```text
2026-08-16_081500_CLIENTE-ABC_COMPROVANTE_A1B2C3D4.pdf
```

## 6. Duplicidade

O backend calcula SHA-256 dos bytes antes de salvar.

Se o mesmo arquivo já estiver registrado, a API retorna:

```json
{
  "status": "duplicate",
  "message": "Este arquivo já foi enviado anteriormente."
}
```

Nenhuma segunda cópia é criada.

## 7. Novas colunas na aba `Registros`

Além das 10 existentes, entram:

- L: SHA-256
- M: Usuário
- N: Plataforma
- O: Dispositivo
- P: Token ID

Os registros antigos continuam válidos; essas colunas ficarão vazias neles.
