import type { Book, BookHighlight } from './types.ts';
import { dumpFrontmatter } from './yaml.ts';

export const FRONTMATTER_KEY = 'kindle-usb';

export interface RenderOptions {
	/** Acrescenta "· page: N" depois da posição quando o Kindle informa a página. */
	includePage: boolean;
}

export function formatDate(d: Date | undefined): string | undefined {
	if (!d) return undefined;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function oneLine(s: string): string {
	return s.replace(/\s*\n\s*/g, ' ').trim();
}

/** Primeira linha do bloco: texto, posição e o ID do bloco. */
export function renderHighlightLine(h: BookHighlight, opts: RenderOptions, id = h.id): string {
	const where: string[] = [];
	if (h.locStart !== undefined) where.push(`location: ${h.locStart}`);
	if (h.page && (opts.includePage || h.locStart === undefined)) where.push(`page: ${h.page}`);
	const suffix = where.length ? ` — ${where.join(' · ')}` : '';
	const prefix = h.isNote ? 'Note: ' : '';
	return `${prefix}${oneLine(h.text)}${suffix} ^ref-${id}`;
}

/** Nota pessoal: preserva as quebras de linha, mas neutraliza separadores "---". */
export function renderNoteText(note: string): string {
	return note
		.split('\n')
		.map((l) => (/^\s*(-\s*){3,}$/.test(l) ? l.replace(/-/g, '\\-') : l.trimEnd()))
		.join('\n')
		.trim();
}

/** Bloco completo, igual ao template padrão do plugin original. */
export function renderHighlightBlock(h: BookHighlight, opts: RenderOptions, id = h.id): string {
	const parts = [renderHighlightLine(h, opts, id)];
	if (h.note) parts.push(renderNoteText(h.note));
	parts.push('---');
	return parts.join('\n\n');
}

function wikiSafe(s: string): string {
	return s.replace(/[[\]|#^]/g, '').trim();
}

export function renderFrontmatter(book: Book, highlightsCount: number, lastAnnotated?: Date): string {
	return dumpFrontmatter(FRONTMATTER_KEY, {
		bookId: book.id,
		title: book.title,
		author: book.author || undefined,
		lastAnnotatedDate: formatDate(lastAnnotated ?? book.lastAnnotated),
		highlightsCount,
	});
}

/** Nota inteira de um livro, no formato das notas do Kindle Highlights. */
export function renderBookNote(book: Book, opts: RenderOptions): string {
	const blocks = book.highlights.map((h) => renderHighlightBlock(h, opts));
	const author = wikiSafe(book.author);
	const metadata = author ? `* Author: [[${author}]]\n` : '';
	return (
		`---\n${renderFrontmatter(book, book.highlights.length)}---\n` +
		`# ${book.shortTitle}\n` +
		`## Metadata\n${metadata}\n` +
		`## Highlights\n${blocks.join('\n')}\n`
	);
}

const MAX_NAME = 150;

/** Nome do arquivo `{{authorsLastNames}}-{{title}}`, sem caracteres perigosos. */
export function fileNameFor(book: Book): string {
	const raw = book.authorsLastNames ? `${book.authorsLastNames}-${book.shortTitle}` : book.shortTitle;
	return sanitizeFileName(raw);
}

export function sanitizeFileName(raw: string): string {
	let name = raw
		// eslint-disable-next-line no-control-regex -- remove caracteres de controle do nome do arquivo
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+/, '')
		.replace(/[.\s]+$/, '');
	if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME).trim();
	return name || 'Kindle book';
}
