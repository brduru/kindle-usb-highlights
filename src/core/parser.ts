import type { Clipping, ClippingKind } from './types.ts';

const SEPARATOR = '==========';

/** Limite de segurança: o arquivo real tem poucas centenas de KB. */
export const MAX_CLIPPINGS_BYTES = 50 * 1024 * 1024;

const KIND_PATTERNS: Array<[RegExp, ClippingKind]> = [
	// A ordem importa: "nota" antes de "destaque", como no plugin original.
	[/\b(nota|note|notiz)\b/i, 'note'],
	[/\b(destaque|highlight|subrayado|surlignement|markierung|evidenziazione)\b/i, 'highlight'],
	[/\b(marcador|bookmark|signet|lesezeichen|segnalibro)\b/i, 'bookmark'],
];

const LOCATION_RE =
	/(?:posi[çc][ãa]o|location|loc\.|posici[óo]n|emplacement|position)\s+(\d+)(?:\s*-\s*(\d+))?/i;
const PAGE_RE = /(?:p[áa]gina|page|seite|pagina)\s+([0-9]+|[ivxlcdm]+)\b/i;

const PT_MONTHS = [
	'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
	'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const EN_MONTHS = [
	'january', 'february', 'march', 'april', 'may', 'june',
	'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Lê o conteúdo de um `My Clippings.txt` e devolve as entradas interpretadas.
 * Blocos malformados são ignorados (o Kindle às vezes grava entradas truncadas).
 */
export function parseClippings(raw: string): Clipping[] {
	const text = raw.replace(/\r\n?/g, '\n');
	const result: Clipping[] = [];
	let current: string[] = [];
	let index = 0;

	const flush = () => {
		const clip = parseBlock(current, index);
		if (clip) {
			result.push(clip);
			index++;
		}
		current = [];
	};

	for (const line of text.split('\n')) {
		if (line.trim() === SEPARATOR) flush();
		else current.push(line);
	}
	flush();
	return result;
}

function stripBom(s: string): string {
	return s.replace(/^\uFEFF+/, '');
}

function parseBlock(lines: string[], index: number): Clipping | null {
	const block = [...lines];
	while (block.length && stripBom(block[0] ?? '').trim() === '') block.shift();
	if (block.length < 2) return null;

	const titleLine = stripBom(block[0] ?? '').trim();
	const metaLine = (block[1] ?? '').trim();
	if (!titleLine || !metaLine.startsWith('-')) return null;

	const { title, author } = parseTitleLine(titleLine);
	const kind = parseKind(metaLine);
	const { locStart, locEnd } = parseLocation(metaLine);
	const pageMatch = PAGE_RE.exec(metaLine);

	const content = block.slice(2);
	if (content.length && (content[0] ?? '').trim() === '') content.shift();
	while (content.length && (content[content.length - 1] ?? '').trim() === '') content.pop();

	const clip: Clipping = {
		index,
		rawTitle: titleLine,
		title,
		rawAuthor: author,
		kind,
		lines: content.map((l) => stripBom(l).trimEnd()),
	};
	if (pageMatch?.[1]) clip.page = pageMatch[1];
	if (locStart !== undefined) clip.locStart = locStart;
	if (locEnd !== undefined) clip.locEnd = locEnd;
	const addedAt = parseAddedDate(metaLine);
	if (addedAt) clip.addedAt = addedAt;
	return clip;
}

/** "Título (Autor)": o autor é o último grupo entre parênteses. */
export function parseTitleLine(line: string): { title: string; author: string } {
	const m = /^(.*)\(([^()]*)\)\s*$/.exec(line);
	if (m && m[1] && m[1].trim()) {
		return { title: m[1].trim(), author: (m[2] ?? '').trim() };
	}
	return { title: line.trim(), author: '' };
}

function parseKind(meta: string): ClippingKind {
	for (const [re, kind] of KIND_PATTERNS) if (re.test(meta)) return kind;
	return 'unknown';
}

export function parseLocation(meta: string): { locStart?: number; locEnd?: number } {
	const m = LOCATION_RE.exec(meta);
	if (!m || !m[1]) return {};
	const start = Number(m[1]);
	let end = start;
	if (m[2]) {
		end = Number(m[2]);
		if (end < start) {
			// Forma abreviada (ex.: "1049-50"): completa com o prefixo do início.
			const s = m[1];
			end = Number(s.slice(0, Math.max(0, s.length - m[2].length)) + m[2]);
			if (end < start) end = start;
		}
	}
	return { locStart: start, locEnd: end };
}

/** Interpreta a data de "Adicionado: ..." / "Added on ..." (hora local). */
export function parseAddedDate(meta: string): Date | undefined {
	const seg = meta.split('|').pop() ?? '';
	const lower = seg.toLowerCase();

	// pt: "sexta-feira, 13 de novembro de 2026 18:08:34"
	let m = /(\d{1,2}) de ([^\s]+) de (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(lower);
	if (m) {
		const month = PT_MONTHS.indexOf(m[2] ?? '');
		if (month >= 0) return makeDate(m[3], month, m[1], m[4], m[5], m[6]);
	}
	// en (EUA): "Friday, November 13, 2026 6:08:34 PM"
	m = /([a-z]+) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower);
	if (m) {
		const month = EN_MONTHS.indexOf(m[1] ?? '');
		if (month >= 0) return makeDate(m[3], month, m[2], to24(m[4], m[7]), m[5], m[6]);
	}
	// en (UK): "Friday, 13 November 2026 18:08:34"
	m = /(\d{1,2}) ([a-z]+) (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower);
	if (m) {
		const month = EN_MONTHS.indexOf(m[2] ?? '');
		if (month >= 0) return makeDate(m[3], month, m[1], to24(m[4], m[7]), m[5], m[6]);
	}
	return undefined;
}

function to24(hour: string | undefined, ampm: string | undefined): string {
	let h = Number(hour ?? 0);
	if (ampm === 'pm' && h < 12) h += 12;
	if (ampm === 'am' && h === 12) h = 0;
	return String(h);
}

function makeDate(
	y: string | undefined,
	month: number,
	d: string | undefined,
	h: string | undefined,
	min: string | undefined,
	s: string | undefined,
): Date | undefined {
	const date = new Date(Number(y), month, Number(d), Number(h ?? 0), Number(min ?? 0), Number(s ?? 0));
	return Number.isNaN(date.getTime()) ? undefined : date;
}
