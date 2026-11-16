import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { NoteInfo, VaultPort } from './core/importer.ts';

/** Implementa a porta do importador sobre a API do Obsidian (só dentro do cofre). */
export class ObsidianVault implements VaultPort {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private file(path: string): TFile {
		const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(f instanceof TFile)) throw new Error(`Arquivo não encontrado: ${path}`);
		return f;
	}

	async exists(path: string): Promise<boolean> {
		return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
	}

	async read(path: string): Promise<string> {
		return this.app.vault.read(this.file(path));
	}

	async create(path: string, content: string): Promise<void> {
		await this.app.vault.create(normalizePath(path), content);
	}

	async process(path: string, fn: (content: string) => string): Promise<void> {
		await this.app.vault.process(this.file(path), fn);
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = normalizePath(path).split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (existing) throw new Error(`Já existe um arquivo com o nome da pasta: ${current}`);
			await this.app.vault.createFolder(current);
		}
	}

	listNotes(): NoteInfo[] {
		return this.app.vault.getMarkdownFiles().map((file) => {
			const info: NoteInfo = { path: file.path };
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (fm) info.frontmatter = fm;
			return info;
		});
	}
}
