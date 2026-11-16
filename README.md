# Kindle USB Highlights

Plugin do [Obsidian](https://obsidian.md) (1.13.1 ou mais novo) que importa os destaques e as notas do Kindle pelo cabo USB, lendo o arquivo `My Clippings.txt` do aparelho. Ele cria **uma nota por livro**, no mesmo formato das notas do plugin [Kindle Highlights](https://github.com/hadynz/obsidian-kindle-plugin).

Serve para livros que não vieram da Amazon, como os enviados por USB ou pelo Calibre. Os destaques desses livros não sincronizam pela nuvem e só existem no `My Clippings.txt`.

## Como fica a nota

```markdown
---
kindle-usb:
  bookId: '31950'
  title: 'Um Livro Inventado: Com Subtítulo'
  author: Ana Silva
  lastAnnotatedDate: '2026-11-13'
  highlightsCount: 12
---
# Um Livro Inventado
## Metadata
* Author: [[Ana Silva]]

## Highlights
A liberdade exige atenção constante e coragem para agir. — location: 494 · page: 49 ^ref-16019

Minha nota pessoal sobre este trecho.

---
```

- **Nome do arquivo** `Sobrenome-Título`: com dois autores, `A-B`; com três ou mais, `A_et_al`.
- **Título (`#`):** o título curto, sem o que está entre parênteses e sem o subtítulo.
- **Linha do destaque:** texto, posição, página (opcional) e um ID de bloco `^ref-NNNNN`. O ID é o mesmo hash do plugin original, então dá para linkar o destaque com `[[nota#^ref-NNNNN]]`.
- **Nota pessoal** (a "Sua nota" do Kindle): fica logo abaixo do destaque correspondente. Nota sem destaque vira um bloco `Note: …`.
- **Frontmatter:** usa a chave `kindle-usb`, e não `kindle-sync`. Assim o Kindle Highlights não adota nem reescreve estas notas.

## Uso

1. Conecte o Kindle por USB.
2. Clique no ícone de livro na barra lateral ou rode o comando **Importar destaques do Kindle (USB)**.
3. O plugin lê o arquivo no caminho padrão (`/run/media/<usuário>/Kindle/documents/My Clippings.txt` no Linux). Também dá para informar outro caminho ou usar **Escolher arquivo…**.
4. Marque os livros e clique em **Importar**.

O modal mostra o que cada livro faria:

| Situação | O que acontece |
| --- | --- |
| **Nova nota** | Cria `Pasta/Sobrenome-Título.md`. |
| **Atualizar** | Mescla os destaques novos na nota que o plugin já criou. |
| **Mesclar na nota da Amazon** | Já existe uma nota do Kindle Highlights para o livro: acrescenta a ela só os destaques que faltam, sem alterar o que já está lá. |

Livros que você desmarcar um a um ficam salvos como ignorados e voltam desmarcados na próxima vez (os botões de marcar e desmarcar todos não mexem nessa lista). As configurações ficam em **Configurações → Kindle USB Highlights**: caminho do arquivo, pasta de destino, mostrar a página, lista de ignorados e histórico.

## Como funciona

### Duplicatas

Quando você ajusta um destaque, o Kindle grava uma entrada nova e mantém a antiga. O plugin descarta um destaque cujo texto está contido noutro na mesma faixa de posição e fica com o mais longo; em caso de empate, fica o mais recente. Dois destaques vizinhos que só compartilham a posição de fronteira (por exemplo, 132-136 e 136-140) continuam separados.

O `My Clippings.txt` não registra exclusões: um destaque apagado no aparelho continua no arquivo. Por isso o arquivo pode ter mais destaques do que a Amazon mostra.

### Notas pessoais

A posição de uma nota coincide com o fim do destaque a que ela pertence. Quando o mesmo destaque tem várias notas, que são edições sucessivas, fica a mais recente.

### Atualização incremental

Reimportar nunca apaga nada da nota:

- **Destaques novos** entram na ordem de posição, antes do próximo destaque existente ou logo depois do último bloco. Seções que você escreveu depois da lista continuam no fim.
- **Destaque ampliado no Kindle:** troca só aquela linha e mantém o `^ref` antigo, para não quebrar links.
- **Nota pessoal nova** num destaque existente é acrescentada abaixo dele.
- **Bloco que você apagou à mão** não volta. O plugin guarda em `data.json` o histórico do que já importou. Para trazer de volta, use **Esquecer histórico**.
- **Frontmatter:** só `highlightsCount` e `lastAnnotatedDate` são atualizados, e só dentro da chave `kindle-usb`.
- **Mesmo resultado:** reimportar o mesmo arquivo não muda nenhum byte.

## Privacidade e segurança

- Não faz nenhuma requisição de rede.
- Fora do cofre, lê apenas o arquivo que você indica, só se for um arquivo comum e com até 50 MB.
- Escreve apenas na pasta de destino, criando notas, e nas notas que você selecionou, acrescentando conteúdo. A escrita usa `vault.process`, uma leitura e escrita atômica.
- O nome do arquivo é saneado: sem `/`, `\`, `..`, caracteres de controle nem caracteres proibidos no Obsidian.
- O frontmatter é gerado por um emissor YAML próprio, sem interpretar YAML de terceiros. Valores com caracteres especiais saem entre aspas com escape.
- Funciona só no desktop (`isDesktopOnly`), porque lê o arquivo do Kindle pelo sistema de arquivos.

A revisão automática do diretório de plugins aponta dois comportamentos, ambos propositais:

- **Acesso direto ao sistema de arquivos (`fs`).** O `My Clippings.txt` fica no Kindle, fora do cofre, e a API do Obsidian só lê arquivos dentro do cofre. O plugin usa `fs` apenas para `stat` e `readFile` do arquivo que você indica; nunca escreve fora do cofre. O botão **Escolher arquivo…** lê o arquivo pelo seletor do sistema, sem `fs`.
- **Listagem dos arquivos do cofre.** Para não duplicar notas, o plugin procura no cofre inteiro as notas que ele mesmo criou (chave `kindle-usb`) e as do Kindle Highlights (chave `kindle-sync`), lendo só o frontmatter já indexado pelo Obsidian. A busca não se limita a uma pasta porque cada pessoa organiza o cofre do seu jeito e pode mover as notas.

## Instalação manual

1. Baixe `main.js`, `manifest.json` e `styles.css` da [release](../../releases) ou gere com `npm run build`.
2. Copie os três arquivos para `<cofre>/.obsidian/plugins/kindle-usb-highlights/`.
3. Em **Configurações → Plugins da comunidade**, recarregue a lista e ative **Kindle USB Highlights**.

## Desenvolvimento

```bash
npm ci
npm test        # testes em Node (node:test), sem o Obsidian
npm run build   # tsc + esbuild → main.js
npm run lint
```

O núcleo (`src/core/`) não importa nada do Obsidian e é testado em Node: parser, deduplicação, YAML, renderização e mesclagem. A integração com o Obsidian fica em `src/main.ts`, `src/settings.ts`, `src/obsidianVault.ts` e `src/ui/`.

## Segurança do código

O CI (`.github/workflows/ci.yml`) reprova o pipeline com qualquer achado:

- **SAST:** OpenGrep, `opengrep scan --config auto --error .`, com o resultado obrigatório de `0 findings`.
- **SCA:** OWASP dep-scan com cdxgen nas dependências npm. A contagem de vulnerabilidades em aberto nos `.vdr.json`, descontados os falsos positivos abaixo, tem de ser `0`.
- **Segredos:** gitleaks no histórico inteiro do git. No repositório do GitHub também ficam ligados o Secret Scanning e o push protection.

As ferramentas têm versão fixada e SHA-256 conferido, e as actions são fixadas por commit. A release só é publicada depois de o CI completo passar. O plugin não tem dependências de runtime: as do `package.json` servem só para o build.

### Falsos positivos (SCA)

Um achado do dep-scan só é descontado se o ID, o pacote entre crases e a versão estiverem na mesma linha desta tabela, com a justificativa.

| ID | Pacote | Versão | Justificativa |
| --- | --- | --- | --- |

## Licença

MIT
