# Changelog

## 0.1.1

- **Configurações** migradas para a API declarativa do Obsidian (1.13+): as opções do plugin aparecem na busca das configurações.
- **Esquecer o histórico** agora pede confirmação antes de apagar o histórico de importação.
- `minAppVersion` passa a ser 1.13.1. Quem usa uma versão mais antiga do Obsidian continua recebendo a 0.1.0.
- Releases passam a trazer notas de versão.

## 0.1.0

Primeira versão.

- Importa os destaques e as notas do `My Clippings.txt` do Kindle conectado por USB, com uma nota por livro, no formato do plugin Kindle Highlights.
- Descarta os destaques repetidos que o Kindle grava quando você ajusta uma seleção: fica o mais longo.
- Associa cada nota pessoal ao destaque correspondente.
- A atualização é incremental: só acrescenta, nunca apaga, e não traz de volta blocos que você apagou à mão.
- Mescla os destaques que faltam nas notas que já existem do Kindle Highlights.
