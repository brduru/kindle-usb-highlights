/**
 * Autores no `My Clippings.txt` vêm em vários formatos:
 *   "Martin, Robert C."            → Robert C. Martin
 *   "Andrew Tanenbaum;Nick Feamster;David Wetherall"
 *   "Aho, Alfred V. & Sethi, Ravi"  (estilo Calibre)
 *   "Tanya Janca"
 */
export interface AuthorName {
	first?: string;
	last: string;
	display: string;
}

export function splitAuthors(raw: string): AuthorName[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];
	const parts = trimmed
		.split(/\s*;\s*|\s+&\s+/)
		.map((p) => p.trim())
		.filter((p) => p !== '');
	return parts.map(parseName);
}

function parseName(part: string): AuthorName {
	const commas = part.split(',').map((p) => p.trim());
	if (commas.length === 2 && commas[0] && commas[1]) {
		const last = commas[0];
		const first = commas[1];
		return { first, last: stripDot(last), display: `${first} ${last}` };
	}
	const words = part.split(/\s+/);
	const last = stripDot(words[words.length - 1] ?? part);
	const result: AuthorName = { last, display: part };
	if (words.length > 1) result.first = words.slice(0, -1).join(' ');
	return result;
}

function stripDot(s: string): string {
	return s.replace(/\.$/, '');
}

/** Junta os nomes no estilo da Amazon: "A and B", "A, B, and C". */
export function displayAuthors(names: AuthorName[]): string {
	const d = names.map((n) => n.display);
	if (d.length <= 1) return d[0] ?? '';
	if (d.length === 2) return `${d[0]} and ${d[1]}`;
	return `${d.slice(0, -1).join(', ')}, and ${d[d.length - 1]}`;
}

/** Mesmo critério do plugin original: "Sobrenome", "A-B" ou "A_et_al". */
export function authorsLastNames(names: AuthorName[]): string {
	const first = names[0];
	if (!first) return '';
	let result = first.last;
	if (names.length === 2) result += '-' + (names[1]?.last ?? '');
	else if (names.length > 2) result += '_et_al';
	return result;
}
