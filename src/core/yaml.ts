/**
 * Emissor YAML mínimo que reproduz o estilo do js-yaml 3 (`safeDump`), usado pelo
 * plugin original via gray-matter: aspas simples quando necessário, `>-` para
 * strings longas e aspas duplas com escape para caracteres não imprimíveis.
 * Só emite (nunca interpreta) e só aceita o formato que o plugin precisa:
 * um mapa de um nível com valores string ou número.
 */

const LINE_WIDTH = 80;
const INDENT = 2;

export type YamlValue = string | number;

export function dumpFrontmatter(rootKey: string, data: Record<string, YamlValue | undefined>): string {
	let out = `${rootKey}:\n`;
	const pad = ' '.repeat(INDENT);
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined) continue;
		out += `${pad}${key}: ${scalar(value, INDENT * 2)}\n`;
	}
	return out;
}

function scalar(value: YamlValue, indent: number): string {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? String(value) : `'${String(value)}'`;
	}
	return writeString(value, indent);
}

const DEPRECATED_BOOLEANS = new Set([
	'y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON',
	'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF',
]);

function isPrintable(c: number): boolean {
	return (
		(c >= 0x20 && c <= 0x7e) ||
		(c >= 0xa1 && c <= 0xd7ff && c !== 0x2028 && c !== 0x2029) ||
		(c >= 0xe000 && c <= 0xfffd && c !== 0xfeff) ||
		(c >= 0x10000 && c <= 0x10ffff)
	);
}

function isWhitespace(c: number): boolean {
	return c === 0x20 || c === 0x09;
}

const FIRST_INDICATORS = new Set('-?:,[]{}#&*!|=>\'"%@`'.split('').map((c) => c.charCodeAt(0)));
const FLOW_UNSAFE = new Set(',[]{}:'.split('').map((c) => c.charCodeAt(0)));

function isPlainSafeFirst(c: number): boolean {
	return isPrintable(c) && c !== 0xfeff && !isWhitespace(c) && !FIRST_INDICATORS.has(c);
}

function isPlainSafe(c: number, prev: number | undefined): boolean {
	if (!isPrintable(c) || c === 0xfeff || FLOW_UNSAFE.has(c)) return false;
	if (c === 0x23 /* # */) return prev !== undefined && !isWhitespace(prev) && prev !== 0x0a;
	return true;
}

const AMBIGUOUS: RegExp[] = [
	/^(?:~|null|Null|NULL)$/,
	/^(?:true|True|TRUE|false|False|FALSE)$/,
	/^[-+]?(?:0b[01_]+|0x[0-9a-fA-F_]+|0[0-7_]*|[1-9][0-9_]*(?::[0-5]?[0-9])*)$/,
	/^(?:[-+]?(?:[0-9][0-9_]*)(?:\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/,
	/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
	/^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?$/,
	/^<<$/,
];

function isAmbiguous(s: string): boolean {
	return AMBIGUOUS.some((re) => re.test(s));
}

function writeString(s: string, indent: number): string {
	if (s.length === 0) return "''";
	if (DEPRECATED_BOOLEANS.has(s)) return `'${s}'`;

	const lineWidth = Math.max(Math.min(LINE_WIDTH, 40), LINE_WIDTH - indent);
	let plain = isPlainSafeFirst(s.charCodeAt(0)) && !isWhitespace(s.charCodeAt(s.length - 1));
	let hasLineBreak = false;
	let hasFoldableLine = false;
	let previousLineBreak = -1;
	let i = 0;
	for (; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c === 0x0a) {
			hasLineBreak = true;
			hasFoldableLine =
				hasFoldableLine || (i - previousLineBreak - 1 > lineWidth && s[previousLineBreak + 1] !== ' ');
			previousLineBreak = i;
		} else if (!isPrintable(c)) {
			return doubleQuoted(s);
		}
		plain = plain && isPlainSafe(c, i > 0 ? s.charCodeAt(i - 1) : undefined);
	}
	hasFoldableLine =
		hasFoldableLine || (i - previousLineBreak - 1 > lineWidth && s[previousLineBreak + 1] !== ' ');

	if (!hasLineBreak && !hasFoldableLine) {
		return plain && !isAmbiguous(s) ? s : `'${s.replace(/'/g, "''")}'`;
	}
	// Valores com quebra de linha não ocorrem neste plugin; aspas duplas são seguras.
	if (hasLineBreak || s.startsWith(' ')) return doubleQuoted(s);
	const pad = ' '.repeat(indent);
	return '>-\n' + foldLine(s, lineWidth).split('\n').map((l) => pad + l).join('\n');
}

/** Quebra uma linha nos espaços, como o `foldLine` do js-yaml. */
function foldLine(line: string, width: number): string {
	const breakRe = / [^ ]/g;
	let match: RegExpExecArray | null;
	let start = 0;
	let end: number;
	let curr = 0;
	let next: number;
	let result = '';
	while ((match = breakRe.exec(line))) {
		next = match.index;
		if (next - start > width) {
			end = curr > start ? curr : next;
			result += '\n' + line.slice(start, end);
			start = end + 1;
		}
		curr = next;
	}
	result += '\n';
	if (line.length - start > width && curr > start) {
		result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
	} else {
		result += line.slice(start);
	}
	return result.slice(1);
}

function doubleQuoted(s: string): string {
	let out = '';
	for (const ch of s) {
		const c = ch.codePointAt(0) ?? 0;
		if (ch === '"') out += '\\"';
		else if (ch === '\\') out += '\\\\';
		else if (ch === '\n') out += '\\n';
		else if (ch === '\t') out += '\\t';
		else if (ch === '\r') out += '\\r';
		else if (!isPrintable(c)) {
			out += c <= 0xff ? '\\x' + c.toString(16).toUpperCase().padStart(2, '0')
				: c <= 0xffff ? '\\u' + c.toString(16).toUpperCase().padStart(4, '0')
				: '\\U' + c.toString(16).toUpperCase().padStart(8, '0');
		} else out += ch;
	}
	return `"${out}"`;
}
