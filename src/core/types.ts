export type ClippingKind = 'highlight' | 'note' | 'bookmark' | 'unknown';

/** Uma entrada crua do `My Clippings.txt`, já interpretada. */
export interface Clipping {
	/** Ordem no arquivo (0 = primeira entrada). */
	index: number;
	/** Linha de título completa, sem BOM. */
	rawTitle: string;
	title: string;
	/** Autor como aparece no arquivo (ex.: "Martin, Robert C."). */
	rawAuthor: string;
	kind: ClippingKind;
	page?: string;
	locStart?: number;
	locEnd?: number;
	addedAt?: Date;
	/** Linhas de conteúdo (sem a linha em branco que separa do cabeçalho). */
	lines: string[];
}

/** Um destaque deduplicado, pronto para ser renderizado. */
export interface BookHighlight {
	/** ID do bloco (`^ref-<id>`), fletcher16 do texto, como no plugin original. */
	id: string;
	/** Chave interna de "já importado" (cyrb53 do texto normalizado). */
	key: string;
	text: string;
	locStart?: number;
	locEnd?: number;
	page?: string;
	note?: string;
	addedAt?: Date;
	/** Nota pessoal sem destaque correspondente. */
	isNote?: boolean;
	/** Ordem no arquivo de origem, para desempate. */
	index: number;
}

export interface BookStats {
	/** Entradas de destaque no arquivo, contando repetições. */
	rawHighlights: number;
	/** Destaques descartados por estarem contidos noutro. */
	duplicates: number;
	notes: number;
	/** Notas substituídas por outra mais recente no mesmo destaque. */
	replacedNotes: number;
	/** Notas sem destaque correspondente (viram bloco próprio). */
	orphanNotes: number;
	bookmarks: number;
}

export interface Book {
	/** Chave estável do livro (título + autor), usada nas configurações. */
	key: string;
	/** fletcher16 do título, como o `bookId` do plugin original. */
	id: string;
	title: string;
	shortTitle: string;
	rawAuthor: string;
	/** Autor para exibição (ex.: "Robert C. Martin"). */
	author: string;
	/** Combinação de sobrenomes usada no nome do arquivo (ex.: "Bell_et_al"). */
	authorsLastNames: string;
	highlights: BookHighlight[];
	lastAnnotated?: Date;
	stats: BookStats;
}
