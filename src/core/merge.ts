import { normalizeText } from './hash.ts';
import {
	FRONTMATTER_KEY,
	formatDate,
	renderHighlightBlock,
	renderHighlightLine,
	renderNoteText,
	type RenderOptions,
} from './render.ts';
import type { Book, BookHighlight } from './types.ts';

export interface MergeOptions extends RenderOptions {
	/** Chaves de destaques já importados antes (inclusive os que o usuário apagou). */
	seen: ReadonlySet<string>;
}

export interface MergeResult {
	content: string;
	changed: boolean;
	/** Destaques novos inseridos. */
	added: number;
	/** Destaques existentes ampliados (o Kindle gravou uma versão mais longa). */
	updated: number;
	/** Notas pessoais acrescentadas a destaques que já estavam na nota. */
	notesAdded: number;
	/** Destaques já importados antes que não estão mais na nota (apagados à mão). */
	skippedDeleted: number;
	/** Total de blocos `^ref-` na nota depois da mesclagem. */
	total: number;
	/** Chaves de todos os destaques do livro, para guardar como "já vistos". */
	seenKeys: string[];
}

interface Entry {
	line: number;
	id: string;
	norm: string;
	loc?: number;
}

const REF_RE = /\s\^ref-([A-Za-z0-9-]+)\s*$/;
const NEAR = 20;

function parseEntries(lines: string[]): Entry[] {
	const entries: Entry[] = [];
	lines.forEach((line, i) => {
		const m = REF_RE.exec(line);
		if (!m || !m[1]) return;
		let body = line.slice(0, m.index);
		let loc: number | undefined;
		const sep = body.lastIndexOf(' — ');
		if (sep >= 0) {
			const tail = body.slice(sep + 3);
			if (/^(location|page):/.test(tail)) {
				body = body.slice(0, sep);
				const lm = /location:\s*\[?(\d+)/.exec(tail);
				if (lm?.[1]) loc = Number(lm[1]);
			}
		}
		const entry: Entry = { line: i, id: m[1], norm: normalizeText(body) };
		if (loc !== undefined) entry.loc = loc;
		entries.push(entry);
	});
	return entries;
}

function matchText(h: BookHighlight): string {
	return normalizeText((h.isNote ? 'Note: ' : '') + h.text);
}

function near(e: Entry, h: BookHighlight): boolean {
	if (e.loc === undefined || h.locStart === undefined) return true;
	return e.loc >= h.locStart - NEAR && e.loc <= (h.locEnd ?? h.locStart) + NEAR;
}

/** Posições que um texto existente ocupa, estimadas pelo tamanho (~100 caracteres cada). */
function spanOf(e: Entry): number {
	return Math.ceil(e.norm.length / 100) + 2;
}

/** O existente pode conter o novo: o novo começa dentro da faixa estimada do existente. */
function coversNew(e: Entry, h: BookHighlight): boolean {
	if (e.loc === undefined || h.locStart === undefined) return true;
	return e.loc <= (h.locEnd ?? h.locStart) && h.locStart <= e.loc + spanOf(e);
}

/** O novo pode ampliar o existente: a posição do existente cai dentro da faixa do novo. */
function insideNew(e: Entry, h: BookHighlight): boolean {
	if (e.loc === undefined || h.locStart === undefined) return true;
	return e.loc >= h.locStart && e.loc <= (h.locEnd ?? h.locStart);
}

/**
 * Mescla os destaques de um livro numa nota existente, sem apagar nada:
 * só insere blocos novos, amplia a linha de um destaque que o Kindle estendeu
 * (mantendo o `^ref` antigo) e acrescenta notas pessoais que faltam.
 */
export function mergeBookIntoNote(content: string, book: Book, opts: MergeOptions): MergeResult {
	const lines = content.split('\n');
	const entries = parseEntries(lines);
	const usedIds = new Set(entries.map((e) => e.id));
	const inserts = new Map<number, string[]>();
	const replacements = new Map<number, string>();
	const result = { added: 0, updated: 0, notesAdded: 0, skippedDeleted: 0 };

	const insertAt = (at: number, chunk: string[]) => {
		const list = inserts.get(at);
		if (list) list.push(...chunk);
		else inserts.set(at, [...chunk]);
	};

	const blockRegion = (e: Entry): string => {
		const region: string[] = [];
		for (let i = e.line + 1; i < lines.length; i++) {
			const l = lines[i] ?? '';
			if (l.trim() === '---' || REF_RE.test(l)) break;
			region.push(l);
		}
		return normalizeText(region.join('\n'));
	};

	const addNoteIfMissing = (e: Entry, h: BookHighlight) => {
		if (!h.note) return;
		const note = renderNoteText(h.note);
		if (blockRegion(e).includes(normalizeText(note))) return;
		insertAt(e.line + 1, ['', ...note.split('\n')]);
		result.notesAdded++;
	};

	const anchorFor = (h: BookHighlight): number => {
		if (h.locStart !== undefined) {
			const next = entries.find((e) => e.loc !== undefined && e.loc > (h.locStart ?? 0));
			if (next) return next.line;
		}
		const last = entries[entries.length - 1];
		if (last) {
			for (let i = last.line + 1; i < lines.length; i++) {
				if ((lines[i] ?? '').trim() === '---') return i + 1;
			}
		} else {
			const heading = lines.findIndex((l) => /^##\s+Highlights\s*$/.test(l));
			if (heading >= 0) return heading + 1;
		}
		return lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
	};

	for (const h of book.highlights) {
		const t = matchText(h);

		const same = entries.find(
			(e) => (e.norm === t && near(e, h)) || (e.norm.includes(t) && coversNew(e, h)),
		);
		if (same) {
			addNoteIfMissing(same, h);
			continue;
		}

		const extended = entries.find((e) => e.norm.length > 0 && t.includes(e.norm) && insideNew(e, h));
		if (extended) {
			replacements.set(extended.line, renderHighlightLine(h, opts, extended.id));
			extended.norm = t;
			result.updated++;
			addNoteIfMissing(extended, h);
			continue;
		}

		if (opts.seen.has(h.key)) {
			result.skippedDeleted++;
			continue;
		}

		let id = h.id;
		for (let n = 2; usedIds.has(id); n++) id = `${h.id}-${n}`;
		usedIds.add(id);
		const at = anchorFor(h);
		const chunk = renderHighlightBlock(h, opts, id).split('\n');
		// Bloco inserido antes de outro destaque: o "---" já separa os dois.
		// No fim da lista (ou logo após o título), idem; só garantimos a ordem.
		insertAt(at, chunk);
		result.added++;
	}

	for (const [line, text] of replacements) lines[line] = text;
	const positions = [...inserts.keys()].sort((a, b) => b - a);
	for (const at of positions) lines.splice(at, 0, ...(inserts.get(at) ?? []));

	let total = 0;
	let bodyStart = 0;
	if (lines[0] === '---') {
		const end = lines.indexOf('---', 1);
		if (end > 0) bodyStart = end + 1;
	}
	for (let i = bodyStart; i < lines.length; i++) if (REF_RE.test(lines[i] ?? '')) total++;

	let out = lines.join('\n');
	out = updateFrontmatter(out, total, formatDate(book.lastAnnotated));

	return {
		content: out,
		changed: out !== content,
		...result,
		total,
		seenKeys: book.highlights.map((h) => h.key),
	};
}

/** Atualiza `highlightsCount` e `lastAnnotatedDate` só dentro da chave do plugin. */
export function updateFrontmatter(content: string, count: number, lastDate: string | undefined): string {
	const lines = content.split('\n');
	if (lines[0] !== '---') return content;
	const end = lines.indexOf('---', 1);
	if (end < 0) return content;
	const start = lines.findIndex((l, i) => i > 0 && i < end && l === `${FRONTMATTER_KEY}:`);
	if (start < 0) return content;
	for (let i = start + 1; i < end; i++) {
		const l = lines[i] ?? '';
		if (!/^\s+\S/.test(l)) break;
		const countMatch = /^(\s+)highlightsCount:\s*\d+\s*$/.exec(l);
		if (countMatch) lines[i] = `${countMatch[1]}highlightsCount: ${count}`;
		const dateMatch = /^(\s+)lastAnnotatedDate:\s*'?(\d{4}-\d{2}-\d{2})'?\s*$/.exec(l);
		if (dateMatch && lastDate && lastDate > (dateMatch[2] ?? '')) {
			lines[i] = `${dateMatch[1]}lastAnnotatedDate: '${lastDate}'`;
		}
	}
	return lines.join('\n');
}
