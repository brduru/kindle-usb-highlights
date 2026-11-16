import { authorsLastNames, displayAuthors, splitAuthors } from './authors.ts';
import { fletcher16, normalizeText, seenKey } from './hash.ts';
import type { Book, BookHighlight, Clipping } from './types.ts';

/**
 * Título curto, como o `{{title}}` do plugin original: sem trechos entre
 * parênteses e sem o subtítulo depois do último ":".
 */
export function shortTitle(title: string): string {
	return title
		.replace(/ *\([^)]*\) */g, '')
		.replace(/:([^:]*)$/g, '')
		.replace(/[']/g, '')
		.replace(/\[/g, '(')
		.replace(/\]/g, ')')
		.trim();
}

export function bookKey(title: string, rawAuthor: string): string {
	return `${title}␟${rawAuthor}`;
}

/** Agrupa as entradas por livro, deduplica e associa as notas. */
export function buildBooks(clips: Clipping[]): Book[] {
	const groups = new Map<string, Clipping[]>();
	for (const c of clips) {
		const key = bookKey(c.title, c.rawAuthor);
		const list = groups.get(key);
		if (list) list.push(c);
		else groups.set(key, [c]);
	}
	const books: Book[] = [];
	for (const [key, list] of groups) books.push(buildBook(key, list));
	return books;
}

interface Candidate {
	clip: Clipping;
	text: string;
	norm: string;
	parent?: Candidate;
	addedAt?: Date;
	note?: { text: string; addedAt?: Date; index: number };
}

function overlaps(a: Clipping, b: Clipping): boolean {
	if (a.locStart !== undefined && b.locStart !== undefined) {
		const aEnd = a.locEnd ?? a.locStart;
		const bEnd = b.locEnd ?? b.locStart;
		return a.locStart <= bEnd && b.locStart <= aEnd;
	}
	if (a.page && b.page) return a.page === b.page;
	return true;
}

function later(a?: Date, b?: Date): Date | undefined {
	if (!a) return b;
	if (!b) return a;
	return a.getTime() >= b.getTime() ? a : b;
}

function root(c: Candidate): Candidate {
	let cur = c;
	while (cur.parent) cur = cur.parent;
	return cur;
}

function joinHighlightText(lines: string[]): string {
	return lines.map((l) => l.trim()).filter((l) => l !== '').join(' ');
}

function buildBook(key: string, clips: Clipping[]): Book {
	const first = clips[0];
	const title = first?.title ?? '';
	const rawAuthor = first?.rawAuthor ?? '';
	const names = splitAuthors(rawAuthor);

	const highlights: Candidate[] = [];
	const notes: Clipping[] = [];
	let bookmarks = 0;
	for (const c of clips) {
		if (c.kind === 'bookmark') bookmarks++;
		else if (c.kind === 'note') notes.push(c);
		else {
			const text = joinHighlightText(c.lines);
			if (text) highlights.push({ clip: c, text, norm: normalizeText(text), addedAt: c.addedAt });
		}
	}

	// 1) Deduplicação: um destaque contido noutro, na mesma faixa de posição,
	//    é a versão antiga de um ajuste. Fica o mais longo (em empate, o mais recente).
	for (const h of highlights) {
		let best: Candidate | undefined;
		for (const o of highlights) {
			if (o === h || !overlaps(h.clip, o.clip) || !o.norm.includes(h.norm)) continue;
			const absorbs =
				o.norm.length > h.norm.length ||
				(o.norm.length === h.norm.length && o.clip.index > h.clip.index);
			if (!absorbs) continue;
			if (
				!best ||
				o.norm.length > best.norm.length ||
				(o.norm.length === best.norm.length && o.clip.index > best.clip.index)
			) {
				best = o;
			}
		}
		if (best) h.parent = best;
	}
	const survivors = highlights.filter((h) => !h.parent);
	for (const h of highlights) {
		if (h.parent) {
			const r = root(h);
			r.addedAt = later(r.addedAt, h.clip.addedAt);
		}
	}

	// 2) Notas: a posição da nota coincide com o fim do destaque. A associação é
	//    feita antes da deduplicação e transferida para o destaque sobrevivente.
	let replacedNotes = 0;
	const orphans: Clipping[] = [];
	for (const n of notes) {
		const text = n.lines.join('\n').trim();
		if (!text) continue;
		const target = findNoteTarget(n, highlights);
		if (!target) {
			orphans.push(n);
			continue;
		}
		const r = root(target);
		const incoming = { text, addedAt: n.addedAt, index: n.index };
		if (!r.note) r.note = incoming;
		else {
			replacedNotes++;
			if (isNewer(incoming, r.note)) r.note = incoming;
		}
		r.addedAt = later(r.addedAt, n.addedAt);
	}

	// 3) Notas sem destaque: uma por posição (a mais recente).
	const orphanByLoc = new Map<string, Clipping>();
	for (const n of orphans) {
		const k = `${n.locStart ?? ''}|${n.page ?? ''}`;
		const prev = orphanByLoc.get(k);
		if (!prev) orphanByLoc.set(k, n);
		else {
			replacedNotes++;
			if (isNewer({ addedAt: n.addedAt, index: n.index }, { addedAt: prev.addedAt, index: prev.index })) {
				orphanByLoc.set(k, n);
			}
		}
	}

	const result: BookHighlight[] = [];
	const usedIds = new Map<string, number>();
	const uniqueId = (text: string): string => {
		const base = String(fletcher16(text));
		const n = usedIds.get(base) ?? 0;
		usedIds.set(base, n + 1);
		return n === 0 ? base : `${base}-${n + 1}`;
	};

	const items: Array<{ clip: Clipping; text: string; note?: string; addedAt?: Date; isNote?: boolean }> = [];
	for (const s of survivors) {
		items.push({ clip: s.clip, text: s.text, note: s.note?.text, addedAt: s.addedAt });
	}
	for (const n of orphanByLoc.values()) {
		items.push({ clip: n, text: n.lines.join('\n').trim(), addedAt: n.addedAt, isNote: true });
	}
	items.sort((a, b) => sortPos(a.clip) - sortPos(b.clip) || a.clip.index - b.clip.index);

	let lastAnnotated: Date | undefined;
	for (const it of items) {
		const h: BookHighlight = {
			id: uniqueId(it.text),
			key: seenKey(it.text),
			text: it.text,
			index: it.clip.index,
		};
		if (it.clip.locStart !== undefined) h.locStart = it.clip.locStart;
		if (it.clip.locEnd !== undefined) h.locEnd = it.clip.locEnd;
		if (it.clip.page) h.page = it.clip.page;
		if (it.note) h.note = it.note;
		if (it.addedAt) h.addedAt = it.addedAt;
		if (it.isNote) h.isNote = true;
		lastAnnotated = later(lastAnnotated, it.addedAt);
		result.push(h);
	}

	const book: Book = {
		key,
		id: String(fletcher16(title)),
		title,
		shortTitle: shortTitle(title) || title,
		rawAuthor,
		author: displayAuthors(names) || rawAuthor,
		authorsLastNames: authorsLastNames(names),
		highlights: result,
		stats: {
			rawHighlights: highlights.length,
			duplicates: highlights.length - survivors.length,
			notes: notes.length,
			replacedNotes,
			orphanNotes: orphanByLoc.size,
			bookmarks,
		},
	};
	if (lastAnnotated) book.lastAnnotated = lastAnnotated;
	return book;
}

function sortPos(c: Clipping): number {
	if (c.locStart !== undefined) return c.locStart;
	const p = Number(c.page);
	return Number.isFinite(p) ? p : 0;
}

function isNewer(
	a: { addedAt?: Date; index: number },
	b: { addedAt?: Date; index: number },
): boolean {
	if (a.addedAt && b.addedAt && a.addedAt.getTime() !== b.addedAt.getTime()) {
		return a.addedAt.getTime() > b.addedAt.getTime();
	}
	return a.index > b.index;
}

function findNoteTarget(n: Clipping, highlights: Candidate[]): Candidate | undefined {
	const loc = n.locStart;
	let cands: Candidate[];
	if (loc !== undefined) {
		cands = highlights.filter((h) => (h.clip.locEnd ?? h.clip.locStart) === loc);
		if (!cands.length) {
			cands = highlights.filter(
				(h) =>
					h.clip.locStart !== undefined &&
					h.clip.locStart <= loc &&
					loc <= (h.clip.locEnd ?? h.clip.locStart),
			);
		}
	} else if (n.page) {
		cands = highlights.filter((h) => h.clip.page === n.page && h.clip.locStart === undefined);
	} else {
		cands = [];
	}
	if (!cands.length) return undefined;
	// Prefere o destaque gravado por último antes da nota; senão, o mais recente.
	const noteTime = n.addedAt?.getTime();
	const before =
		noteTime === undefined
			? []
			: cands.filter((h) => h.clip.addedAt !== undefined && h.clip.addedAt.getTime() <= noteTime);
	const pool = before.length ? before : cands;
	return pool.reduce((best, h) =>
		isNewer({ addedAt: h.clip.addedAt, index: h.clip.index }, { addedAt: best.clip.addedAt, index: best.clip.index })
			? h
			: best,
	);
}
