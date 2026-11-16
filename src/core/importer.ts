import { normalizeText } from './hash.ts';
import { mergeBookIntoNote, type MergeResult } from './merge.ts';
import { buildBooks, shortTitle } from './books.ts';
import { parseClippings } from './parser.ts';
import { FRONTMATTER_KEY, fileNameFor, renderBookNote, type RenderOptions } from './render.ts';
import type { Book } from './types.ts';

/** Estado persistido por livro (em `data.json` do plugin). */
export interface BookState {
	path: string;
	/** Chaves dos destaques já importados (para não ressuscitar os apagados). */
	seen: string[];
}

export interface NoteInfo {
	path: string;
	frontmatter?: Record<string, unknown>;
}

/** O pouco de cofre (vault) de que o importador precisa; implementado sobre a API do Obsidian. */
export interface VaultPort {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	create(path: string, content: string): Promise<void>;
	/** Leitura-modificação-escrita atômica (no Obsidian, `vault.process`). */
	process(path: string, fn: (content: string) => string): Promise<void>;
	ensureFolder(path: string): Promise<void>;
	listNotes(): NoteInfo[];
}

export type PlanAction = 'create' | 'update' | 'amazon';

export interface BookPlan {
	book: Book;
	action: PlanAction;
	path: string;
	/** Destaques que entrariam numa importação agora. */
	newCount: number;
	updatedCount: number;
	notesAdded: number;
	/** Sugestão de seleção no modal. */
	selected: boolean;
	/** O usuário mexeu nesta caixa à mão (só então a escolha vira "ignorado"). */
	touched?: boolean;
	/** Já existe uma nota da Amazon (Kindle Highlights) para este livro. */
	amazonNote?: string;
}

export interface ImportSettings extends RenderOptions {
	folder: string;
	books: Record<string, BookState>;
	ignoredBooks: string[];
}

export function normalizeFolder(folder: string): string {
	const parts = folder
		.replace(/\\/g, '/')
		.split('/')
		.map((p) => p.trim())
		.filter((p) => p !== '' && p !== '.');
	if (parts.some((p) => p === '..')) throw new Error('A pasta de destino não pode conter "..".');
	return parts.join('/');
}

function joinPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}` : name;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Compara títulos ignorando edição, parênteses e subtítulo (Amazon e USB divergem nisso). */
export function sameTitle(a: string, b: string): boolean {
	const core = (t: string) => normalizeText(shortTitle(t).split(':')[0] ?? '');
	const ca = core(a);
	return ca !== '' && ca === core(b);
}

export function parseBooks(raw: string): Book[] {
	return buildBooks(parseClippings(raw))
		.filter((b) => b.highlights.length > 0)
		.sort((a, b) => a.shortTitle.localeCompare(b.shortTitle, 'pt'));
}

/** Decide, para cada livro, se cria nota, atualiza a sua ou encontrou uma da Amazon. */
export async function planImport(books: Book[], vault: VaultPort, settings: ImportSettings): Promise<BookPlan[]> {
	const folder = normalizeFolder(settings.folder);
	const notes = vault.listNotes();
	const ignored = new Set(settings.ignoredBooks);
	const plans: BookPlan[] = [];
	const reserved = new Set<string>();

	for (const book of books) {
		const state = settings.books[book.key];
		let path: string | undefined;
		let action: PlanAction = 'create';
		let amazonNote: string | undefined;

		if (state && (await vault.exists(state.path))) {
			path = state.path;
			action = 'update';
		}
		if (!path) {
			const own = notes.find((n) => {
				const fm = asRecord(n.frontmatter?.[FRONTMATTER_KEY]);
				return fm && String(fm.bookId) === book.id && fm.title === book.title;
			});
			if (own) {
				path = own.path;
				action = 'update';
			}
		}
		const amazon = notes.find((n) => {
			const fm = asRecord(n.frontmatter?.['kindle-sync']);
			const title = fm?.title ?? n.frontmatter?.['kindle-title'];
			return typeof title === 'string' && sameTitle(title, book.title);
		});
		if (amazon) amazonNote = amazon.path;
		if (!path && amazon) {
			path = amazon.path;
			action = 'amazon';
		}
		if (!path) {
			const base = fileNameFor(book);
			let candidate = joinPath(folder, `${base}.md`);
			for (let n = 2; reserved.has(candidate) || (await vault.exists(candidate)); n++) {
				candidate = joinPath(folder, `${base} (${n}).md`);
			}
			path = candidate;
		}
		reserved.add(path);

		const plan: BookPlan = {
			book,
			action,
			path,
			newCount: book.highlights.length,
			updatedCount: 0,
			notesAdded: 0,
			// Notas da Amazon também vêm marcadas: a mesclagem só acrescenta o que falta.
			selected: !ignored.has(book.key),
		};
		if (amazonNote) plan.amazonNote = amazonNote;
		if (action !== 'create') {
			const preview = mergeBookIntoNote(await vault.read(path), book, {
				...settings,
				seen: new Set(state?.seen ?? []),
			});
			plan.newCount = preview.added;
			plan.updatedCount = preview.updated;
			plan.notesAdded = preview.notesAdded;
		}
		plans.push(plan);
	}
	return plans;
}

export interface ImportOutcome {
	created: number;
	updated: number;
	unchanged: number;
	highlightsAdded: number;
	failures: Array<{ title: string; error: string }>;
}

/** Executa o plano para os livros selecionados e devolve o estado novo de cada livro. */
export async function executeImport(
	plans: BookPlan[],
	vault: VaultPort,
	settings: ImportSettings,
): Promise<ImportOutcome> {
	const outcome: ImportOutcome = { created: 0, updated: 0, unchanged: 0, highlightsAdded: 0, failures: [] };
	const ignored = new Set(settings.ignoredBooks);

	for (const plan of plans) {
		const { book } = plan;
		if (!plan.selected) {
			if (plan.touched) ignored.add(book.key);
			continue;
		}
		ignored.delete(book.key);
		try {
			const state = settings.books[book.key];
			if (plan.action === 'create' && !(await vault.exists(plan.path))) {
				const slash = plan.path.lastIndexOf('/');
				if (slash > 0) await vault.ensureFolder(plan.path.slice(0, slash));
				await vault.create(plan.path, renderBookNote(book, settings));
				settings.books[book.key] = { path: plan.path, seen: book.highlights.map((h) => h.key) };
				outcome.created++;
				outcome.highlightsAdded += book.highlights.length;
				continue;
			}
			let merged: MergeResult | undefined;
			await vault.process(plan.path, (content) => {
				// O histórico vale para o livro, mesmo que a nota tenha sido movida ou renomeada.
				merged = mergeBookIntoNote(content, book, {
					...settings,
					seen: new Set(state?.seen ?? []),
				});
				return merged.content;
			});
			const seen = new Set([...(state?.seen ?? []), ...(merged?.seenKeys ?? [])]);
			settings.books[book.key] = { path: plan.path, seen: [...seen] };
			if (merged?.changed) {
				outcome.updated++;
				outcome.highlightsAdded += merged.added;
			} else outcome.unchanged++;
		} catch (e) {
			outcome.failures.push({ title: book.title, error: e instanceof Error ? e.message : String(e) });
		}
	}
	settings.ignoredBooks = [...ignored];
	return outcome;
}
