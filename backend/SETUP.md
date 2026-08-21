# Configuração segura do Apps Script

1. Substitua o `Code.gs` atual por `Code.gs` deste pacote.
2. No Apps Script, abra **Configurações do projeto**.
3. Em **Propriedades do script**, crie:
   - Nome: `BRACOMIL_APP_TOKEN`
   - Valor: uma chave aleatória longa (recomendado: 32+ bytes / 43+ caracteres).
4. NÃO coloque essa chave no GitHub.
5. Salve e publique **Nova versão** da implantação existente.
6. Mantenha:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. O endpoint continua sendo:

`https://script.google.com/macros/s/AKfycbzV4vxOpMC68i_pw1RlrBpJ92GRkdKKtKAJepTreGE330_fKpJFnEI5w9uVWCFTM9l-Zw/exec`

## Comportamento

- `client=web`: resposta HTML compatível com o iframe da PWA.
- `client=ios`: resposta JSON para o Share Extension.
- `action=ping`: valida a chave sem exigir arquivo.
- Requisições sem chave ou com chave errada retornam `status=error`.

## Observação de segurança

O token é uma camada de autorização operacional. Para a PWA ele é informado pelo usuário e armazenado localmente no navegador, sem ficar hardcoded no repositório. Para iOS ele fica no App Group do aplicativo e da extensão.
