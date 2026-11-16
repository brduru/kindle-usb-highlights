import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fletcher16, normalizeText } from '../src/core/hash.ts';
import { parseAddedDate, parseClippings, parseLocation, parseTitleLine } from '../src/core/parser.ts';
import { authorsLastNames, displayAuthors, splitAuthors } from '../src/core/authors.ts';
import { buildBooks, shortTitle } from '../src/core/books.ts';
import { dumpFrontmatter } from '../src/core/yaml.ts';
import { fileNameFor, renderBookNote, sanitizeFileName } from '../src/core/render.ts';
import { normalizeFolder, parseBooks, sameTitle } from '../src/core/importer.ts';
import { SAMPLE } from './fixtures/clippings.ts';

const OPTS = { includePage: true };

// Valores conferidos com uma implementação independente (Python) do mesmo
// algoritmo, que reproduz os IDs gerados pelo plugin Kindle Highlights.
test('fletcher16 reproduz os IDs do plugin Kindle Highlights', () => {
	assert.equal(fletcher16('Um Livro Inventado: Com Subtítulo'), 31950);
	assert.equal(fletcher16('A liberdade exige atenção constante e coragem para agir.'), 16019);
	assert.equal(fletcher16('DESTAQUE CURTO.'), 24284); // minúsculas antes do hash
	assert.equal(fletcher16(''), 65535);
});

test('título e autor: o autor é o último parêntese', () => {
	assert.deepEqual(parseTitleLine('Um Livro (Autora Exemplo) (Exemplo, Autora)'), {
		title: 'Um Livro (Autora Exemplo)',
		author: 'Exemplo, Autora',
	});
	assert.deepEqual(parseTitleLine('Sem autor'), { title: 'Sem autor', author: '' });
});

test('posição, inclusive a forma abreviada', () => {
	assert.deepEqual(parseLocation('- Seu destaque na página 19 | posição 280-281 | ...'), { locStart: 280, locEnd: 281 });
	assert.deepEqual(parseLocation('- Your Highlight on Location 1049-50 | ...'), { locStart: 1049, locEnd: 1050 });
	assert.deepEqual(parseLocation('- Seu destaque ou posição 77 | ...'), { locStart: 77, locEnd: 77 });
});

test('datas em português e inglês', () => {
	const pt = parseAddedDate('- ... | Adicionado: sexta-feira, 13 de novembro de 2026 18:08:34');
	assert.deepEqual(pt, new Date(2026, 10, 13, 18, 8, 34));
	const marco = parseAddedDate('- ... | Adicionado: domingo, 1 de março de 2026 10:00:00');
	assert.deepEqual(marco, new Date(2026, 2, 1, 10, 0, 0));
	const en = parseAddedDate('- ... | Added on Friday, November 13, 2026 6:08:34 PM');
	assert.deepEqual(en, new Date(2026, 10, 13, 18, 8, 34));
});

test('autores: inversão, separadores e sobrenomes para o nome do arquivo', () => {
	const a = splitAuthors('Exemplo, Autora B.');
	assert.equal(displayAuthors(a), 'Autora B. Exemplo');
	assert.equal(authorsLastNames(a), 'Exemplo');
	const b = splitAuthors('Ana Souza;Beatriz Lima;Carla Dias');
	assert.equal(displayAuthors(b), 'Ana Souza, Beatriz Lima, and Carla Dias');
	assert.equal(authorsLastNames(b), 'Souza_et_al');
	const c = splitAuthors('Reis, Davi M. & Costa, Bia');
	assert.equal(displayAuthors(c), 'Davi M. Reis and Bia Costa');
	assert.equal(authorsLastNames(c), 'Reis-Costa');
});

test('título curto igual ao do plugin original', () => {
	assert.equal(shortTitle('Ciclo Inventado (Livro 5) (Edição em Português)'), 'Ciclo Inventado');
	assert.equal(shortTitle('Livro Curto: Um Subtítulo Longo'), 'Livro Curto');
	assert.equal(shortTitle('Título: Parte: Final'), 'Título: Parte');
	assert.equal(shortTitle('Colchetes [1] e [2]'), 'Colchetes (1) e (2)');
});

test('parser lida com BOM, CRLF e marcadores', () => {
	const clips = parseClippings(SAMPLE);
	assert.equal(clips.length, 12);
	assert.equal(clips[0]?.title, 'Livro de Teste: Um subtítulo qualquer');
	assert.equal(clips[0]?.kind, 'bookmark');
	assert.equal(clips[1]?.kind, 'highlight');
	assert.equal(clips[1]?.page, '19');
	assert.equal(clips[4]?.kind, 'note');
	assert.ok(!clips.some((c) => c.title.startsWith('﻿')));
});

test('deduplicação: contido some, vizinho fica, nota mais recente vence', () => {
	const books = buildBooks(parseClippings(SAMPLE));
	const livro = books.find((b) => b.title.startsWith('Livro de Teste'));
	assert.ok(livro);
	const texts = livro.highlights.map((h) => h.text);
	assert.deepEqual(texts, [
		'Um destaque sem página no começo do livro.',
		'Primeira frase. A liberdade exige atenção. Segunda frase.',
		'Um trecho vizinho que começa onde o outro termina.',
		'Nota solta sem destaque',
	]);
	assert.equal(livro.highlights[1]?.note, 'Minha nota final');
	assert.equal(livro.highlights[3]?.isNote, true);
	assert.equal(livro.stats.duplicates, 2);
	assert.equal(livro.stats.replacedNotes, 1);
	assert.equal(livro.author, 'Ana Silva');
	assert.deepEqual(livro.lastAnnotated, new Date(2026, 10, 15, 10, 0, 0));
});

test('livros só com marcadores não aparecem', () => {
	const books = parseBooks(SAMPLE);
	assert.deepEqual(
		books.map((b) => b.shortTitle),
		['English Book', 'Livro de Teste', 'Outro Livro'],
	);
});

// Saídas esperadas geradas com js-yaml 3.15 (safeDump), o mesmo estilo das
// notas do Kindle Highlights. Única diferença proposital: valor com quebra de
// linha sai entre aspas duplas (o plugin nunca gera esse caso).
test('YAML igual ao do js-yaml 3', () => {
	assert.equal(
		dumpFrontmatter('kindle-sync', {
			bookId: '12345',
			title:
				'Um Livro Inventado: O guia completo para testar quebras de linha longas em títulos (Autor Fictício) (Edição em Português)',
			author: 'Autor Fictício',
			asin: 'B000TESTE0',
			lastAnnotatedDate: '2025-02-01',
			bookImageUrl: 'https://example.com/images/capa-teste.jpg',
			highlightsCount: 5,
		}),
		`kindle-sync:
  bookId: '12345'
  title: >-
    Um Livro Inventado: O guia completo para testar quebras de linha longas em
    títulos (Autor Fictício) (Edição em Português)
  author: Autor Fictício
  asin: B000TESTE0
  lastAnnotatedDate: '2025-02-01'
  bookImageUrl: 'https://example.com/images/capa-teste.jpg'
  highlightsCount: 5
`,
	);
	assert.equal(
		dumpFrontmatter('k', {
			a: 'Ana Lima, Bia Costa, Caio Dias, and Davi Reis',
			b: 'Segurança de Aplicações Ágeis: Habilitando segurança num pipeline de entrega contínua',
			c: 'Ciclo Inventado (Livro 5) (Edição em Português)',
			d: "It's",
			e: 'linha\nquebrada',
			f: 'yes',
		}),
		`k:
  a: 'Ana Lima, Bia Costa, Caio Dias, and Davi Reis'
  b: >-
    Segurança de Aplicações Ágeis: Habilitando segurança num pipeline de entrega
    contínua
  c: Ciclo Inventado (Livro 5) (Edição em Português)
  d: It's
  e: "linha\\nquebrada"
  f: 'yes'
`,
	);
});

test('nota renderizada no formato de referência', () => {
	const [livro] = buildBooks(parseClippings(SAMPLE));
	assert.ok(livro);
	const note = renderBookNote(livro, OPTS);
	const h = livro.highlights[1];
	assert.ok(h);
	assert.equal(
		note.split('\n').slice(0, 14).join('\n'),
		`---
kindle-usb:
  bookId: '${fletcher16(livro.title)}'
  title: 'Livro de Teste: Um subtítulo qualquer'
  author: Ana Silva
  lastAnnotatedDate: '2026-11-15'
  highlightsCount: 4
---
# Livro de Teste
## Metadata
* Author: [[Ana Silva]]

## Highlights
Um destaque sem página no começo do livro. — location: 100 ^ref-${livro.highlights[0]?.id}`,
	);
	assert.ok(
		note.includes(
			`\n---\nPrimeira frase. A liberdade exige atenção. Segunda frase. — location: 279 · page: 19 ^ref-${h.id}\n\nMinha nota final\n\n---\n`,
		),
	);
	assert.ok(note.includes('Note: Nota solta sem destaque — location: 700 · page: 50 ^ref-'));
	assert.ok(note.endsWith('\n\n---\n'));
	assert.ok(!renderBookNote(livro, { includePage: false }).includes('page:'));
});

test('nome de arquivo seguro', () => {
	assert.equal(sanitizeFileName('../../etc/passwd'), 'etc passwd');
	assert.equal(sanitizeFileName('A: B/C\\D*?"<>|#^[x]'), 'A B C D x');
	assert.equal(sanitizeFileName('...'), 'Kindle book');
	assert.equal(sanitizeFileName('a\u0000b\nc'), 'abc');
	const [livro] = buildBooks(parseClippings(SAMPLE));
	assert.ok(livro);
	assert.equal(fileNameFor(livro), 'Silva-Livro de Teste');
});

test('pasta de destino não aceita ".."', () => {
	assert.equal(normalizeFolder('/Leituras//Destaques/'), 'Leituras/Destaques');
	assert.equal(normalizeFolder(''), '');
	assert.throws(() => normalizeFolder('a/../b'));
});

test('títulos da Amazon e do USB se reconhecem', () => {
	assert.ok(sameTitle('Corrida: Prova de fogo (Edição em Português)', 'Corrida: Prova de fogo: 2'));
	assert.ok(sameTitle('Segurança Ágil: Habilitando segurança no pipeline', 'Segurança Ágil'));
	assert.ok(!sameTitle('Rust', 'Redis'));
	assert.equal(normalizeText('  A\n b  '), 'a b');
});
