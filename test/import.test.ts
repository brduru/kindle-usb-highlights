import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	executeImport,
	parseBooks,
	planImport,
	type ImportSettings,
	type NoteInfo,
	type VaultPort,
} from '../src/core/importer.ts';
import { mergeBookIntoNote } from '../src/core/merge.ts';
import { renderBookNote } from '../src/core/render.ts';
import { makeClippings, SAMPLE } from './fixtures/clippings.ts';

/** Cofre em memória; interpreta o frontmatter de forma simplificada. */
class MemoryVault implements VaultPort {
	files = new Map<string, string>();
	folders = new Set<string>();

	async exists(path: string) {
		return this.files.has(path);
	}
	async read(path: string) {
		const c = this.files.get(path);
		if (c === undefined) throw new Error(`não existe: ${path}`);
		return c;
	}
	async create(path: string, content: string) {
		if (this.files.has(path)) throw new Error(`já existe: ${path}`);
		this.files.set(path, content);
	}
	async process(path: string, fn: (c: string) => string) {
		this.files.set(path, fn(await this.read(path)));
	}
	async ensureFolder(path: string) {
		this.folders.add(path);
	}
	listNotes(): NoteInfo[] {
		return [...this.files.entries()].map(([path, content]) => ({ path, frontmatter: parseFm(content) }));
	}
}

function parseFm(content: string): Record<string, unknown> | undefined {
	const m = /^---\n([\s\S]*?)\n---\n/.exec(content);
	if (!m || !m[1]) return undefined;
	const fm: Record<string, Record<string, string>> = {};
	let current: Record<string, string> | undefined;
	for (const line of m[1].split('\n')) {
		const top = /^([\w-]+):\s*$/.exec(line);
		if (top?.[1]) {
			current = {};
			fm[top[1]] = current;
			continue;
		}
		const kv = /^\s+(\w+):\s*(.*)$/.exec(line);
		if (kv?.[1] && current) current[kv[1]] = (kv[2] ?? '').replace(/^'|'$/g, '');
	}
	return fm;
}

function settings(): ImportSettings {
	return { folder: 'Kindle', includePage: true, books: {}, ignoredBooks: [] };
}

async function importAll(vault: MemoryVault, s: ImportSettings, raw = SAMPLE) {
	const plans = await planImport(parseBooks(raw), vault, s);
	const outcome = await executeImport(plans, vault, s);
	return { plans, outcome };
}

test('primeira importação cria uma nota por livro', async () => {
	const vault = new MemoryVault();
	const s = settings();
	const { outcome } = await importAll(vault, s);
	assert.equal(outcome.created, 3);
	assert.deepEqual([...vault.files.keys()].sort(), [
		'Kindle/Doe-English Book.md',
		'Kindle/Silva-Livro de Teste.md',
		'Kindle/Souza_et_al-Outro Livro.md',
	]);
	assert.ok(vault.folders.has('Kindle'));
});

test('reimportar é idempotente (byte a byte)', async () => {
	const vault = new MemoryVault();
	const s = settings();
	await importAll(vault, s);
	const before = new Map(vault.files);
	const { plans, outcome } = await importAll(vault, s);
	assert.equal(outcome.created, 0);
	assert.equal(outcome.updated, 0);
	assert.equal(outcome.unchanged, 3);
	assert.ok(plans.every((p) => p.action === 'update' && p.newCount === 0));
	assert.deepEqual(vault.files, before);
});

test('preserva texto escrito à mão e não ressuscita bloco apagado', async () => {
	const vault = new MemoryVault();
	const s = settings();
	await importAll(vault, s);
	const path = 'Kindle/Silva-Livro de Teste.md';
	let content = await vault.read(path);

	// Comentário à mão depois de um bloco e no fim; apaga o bloco do trecho vizinho.
	content = content.replace('Minha nota final\n', 'Minha nota final\n\nMeu comentário escrito à mão.\n');
	const lines = content.split('\n');
	const i = lines.findIndex((l) => l.startsWith('Um trecho vizinho'));
	lines.splice(i, 3); // linha, linha em branco, "---"
	content = lines.join('\n') + '\n## Minhas reflexões\nTexto livre.\n';
	vault.files.set(path, content);

	// Um destaque novo aparece no Kindle.
	const novo = SAMPLE + makeClippings([
		{
			title: 'Livro de Teste: Um subtítulo qualquer (Silva, Ana)',
			meta: '- Seu destaque na página 30 | posição 400-401 | Adicionado: segunda-feira, 16 de novembro de 2026 08:00:00',
			text: 'Um destaque novinho.',
		},
	]);
	const { outcome } = await importAll(vault, s, novo);
	assert.equal(outcome.highlightsAdded, 1);
	const after = await vault.read(path);
	assert.ok(after.includes('Meu comentário escrito à mão.'));
	assert.ok(after.includes('## Minhas reflexões\nTexto livre.'));
	assert.ok(!after.includes('Um trecho vizinho'));
	// O novo entra em ordem de posição (antes da nota solta em 700), não no fim do arquivo.
	assert.ok(after.indexOf('Um destaque novinho.') < after.indexOf('Note: Nota solta'));
	assert.ok(after.indexOf('Um destaque novinho.') < after.indexOf('## Minhas reflexões'));
	assert.match(after, /highlightsCount: 4\n/);
	assert.match(after, /lastAnnotatedDate: '2026-11-16'\n/);
	// Tudo o que existia continua lá.
	for (const line of content.split('\n')) {
		if (!/highlightsCount|lastAnnotatedDate/.test(line)) assert.ok(after.includes(line), line);
	}
});

test('destaque ampliado no Kindle troca só a linha e mantém o ^ref', async () => {
	const vault = new MemoryVault();
	const s = settings();
	await importAll(vault, s);
	const path = 'Kindle/Doe-English Book.md';
	const before = await vault.read(path);
	const ref = /\^ref-([\w-]+)/.exec(before)?.[1];
	const ampliado = SAMPLE + makeClippings([
		{
			title: 'English Book (Doe, John)',
			meta: '- Your Highlight on page 7 | Location 104-107 | Added on Saturday, November 14, 2026 9:00:00 AM',
			text: 'Before. An English highlight. After.',
		},
	]);
	const { outcome } = await importAll(vault, s, ampliado);
	assert.equal(outcome.updated, 1);
	const after = await vault.read(path);
	assert.ok(after.includes(`Before. An English highlight. After. — location: 104 · page: 7 ^ref-${ref}`));
	assert.equal((after.match(/\^ref-/g) ?? []).length, 1);
});

test('nota da Amazon existente: vem marcada e é mesclada sem duplicar', async () => {
	const vault = new MemoryVault();
	const amazon = `---
kindle-sync:
  bookId: '12345'
  title: 'English Book: The Subtitle'
  author: John Doe
  asin: B000000000
  lastAnnotatedDate: '2022-01-14'
  highlightsCount: 1
---
# English Book
## Metadata
* Author: [John Doe](https://www.amazon.comundefined)
* Reference: https://www.amazon.com/dp/B000000000

## Highlights
An English highlight. — location: [105](kindle://book?action=open&asin=B000000000&location=105) ^ref-999

Comentário da Amazon

---
`;
	vault.files.set('Notas/Doe-English Book.md', amazon);
	const s = settings();
	const plans = await planImport(parseBooks(SAMPLE), vault, s);
	const en = plans.find((p) => p.book.shortTitle === 'English Book');
	assert.ok(en);
	assert.equal(en.action, 'amazon');
	assert.equal(en.selected, true);
	assert.equal(en.newCount, 0);

	const out = await executeImport(plans, vault, s);
	assert.equal(out.created, 2);
	assert.equal(await vault.read('Notas/Doe-English Book.md'), amazon);
	assert.equal(s.books[en.book.key]?.path, 'Notas/Doe-English Book.md');

	// Um destaque novo no Kindle entra na nota da Amazon, sem mexer no resto.
	const novo = SAMPLE + makeClippings([
		{
			title: 'English Book (Doe, John)',
			meta: '- Your Highlight on page 9 | Location 200-201 | Added on Saturday, November 14, 2026 9:00:00 AM',
			text: 'A brand new highlight.',
		},
	]);
	await importAll(vault, s, novo);
	const after = await vault.read('Notas/Doe-English Book.md');
	assert.ok(after.startsWith(amazon.slice(0, amazon.indexOf('---\n', 4) + 4)));
	assert.ok(after.includes('Comentário da Amazon\n\n---\nA brand new highlight. — location: 200 · page: 9 ^ref-'));
	assert.equal((after.match(/\^ref-/g) ?? []).length, 2);
});

test('não sobrescreve arquivo alheio com o mesmo nome', async () => {
	const vault = new MemoryVault();
	vault.files.set('Kindle/Silva-Livro de Teste.md', 'Minha nota pessoal, sem frontmatter.\n');
	const s = settings();
	await importAll(vault, s);
	assert.equal(await vault.read('Kindle/Silva-Livro de Teste.md'), 'Minha nota pessoal, sem frontmatter.\n');
	assert.ok(vault.files.has('Kindle/Silva-Livro de Teste (2).md'));
});

test('merge acrescenta nota pessoal que faltava ao bloco', () => {
	const [book] = parseBooks(SAMPLE).filter((b) => b.shortTitle === 'Livro de Teste');
	assert.ok(book);
	const semNota = renderBookNote(book, { includePage: true }).replace('\n\nMinha nota final', '');
	const r = mergeBookIntoNote(semNota, book, { includePage: true, seen: new Set() });
	assert.equal(r.notesAdded, 1);
	assert.equal(r.added, 0);
	assert.equal(r.content, renderBookNote(book, { includePage: true }));
});

test('botões em massa não mandam livros para a lista de ignorados', async () => {
	const vault = new MemoryVault();
	const s = settings();
	const plans = await planImport(parseBooks(SAMPLE), vault, s);
	for (const p of plans) p.selected = false; // "Desmarcar todos"
	const first = plans[0];
	assert.ok(first);
	first.selected = true;
	await executeImport(plans, vault, s);
	assert.deepEqual(s.ignoredBooks, []);

	// Desmarcar à mão, sim, ignora.
	const again = await planImport(parseBooks(SAMPLE), vault, s);
	const second = again[1];
	assert.ok(second);
	second.selected = false;
	second.touched = true;
	await executeImport(again, vault, s);
	assert.deepEqual(s.ignoredBooks, [second.book.key]);
});

test('nota movida ou renomeada: bloco apagado continua sem voltar', async () => {
	const vault = new MemoryVault();
	const s = settings();
	await importAll(vault, s);
	const path = 'Kindle/Silva-Livro de Teste.md';
	const lines = (await vault.read(path)).split('\n');
	const i = lines.findIndex((l) => l.startsWith('Um trecho vizinho'));
	lines.splice(i, 3);
	vault.files.delete(path);
	vault.files.set('Leituras/Outro nome.md', lines.join('\n'));

	const { plans, outcome } = await importAll(vault, s);
	const plan = plans.find((p) => p.book.shortTitle === 'Livro de Teste');
	assert.equal(plan?.action, 'update');
	assert.equal(plan?.path, 'Leituras/Outro nome.md');
	assert.equal(outcome.created, 0);
	assert.ok(!(await vault.read('Leituras/Outro nome.md')).includes('Um trecho vizinho'));
	assert.equal(s.books[plan.book.key]?.path, 'Leituras/Outro nome.md');
});

test('merge não troca destaque curto vizinho que só aparece dentro do novo', () => {
	const [book] = parseBooks(SAMPLE).filter((b) => b.shortTitle === 'Livro de Teste');
	assert.ok(book);
	// "Segunda frase." existe na nota em 300, fora da faixa 279-282 do destaque novo.
	const note = `---
kindle-usb:
  bookId: '1'
  title: x
  highlightsCount: 1
---
# x
## Highlights
Segunda frase. — location: 300 ^ref-1

---
`;
	const only = { ...book, highlights: book.highlights.filter((h) => h.text.startsWith('Primeira frase')) };
	const r = mergeBookIntoNote(note, only, { includePage: true, seen: new Set() });
	assert.equal(r.updated, 0);
	assert.equal(r.added, 1);
	assert.ok(r.content.includes('Segunda frase. — location: 300 ^ref-1'));
});
