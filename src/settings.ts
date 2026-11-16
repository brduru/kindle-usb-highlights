import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { userInfo } from 'os';
import type { BookState } from './core/importer.ts';
import { normalizeFolder } from './core/importer.ts';
import type KindleUsbPlugin from './main.ts';

export interface KindleUsbSettings {
	clippingsPath: string;
	folder: string;
	includePage: boolean;
	books: Record<string, BookState>;
	ignoredBooks: string[];
}

export function defaultClippingsPath(): string {
	const file = 'documents/My Clippings.txt';
	switch (process.platform) {
		case 'darwin':
			return `/Volumes/Kindle/${file}`;
		case 'win32':
			return `E:\\${file.replace('/', '\\')}`;
		default: {
			let user = '';
			try {
				user = userInfo().username;
			} catch {
				user = '';
			}
			return user ? `/run/media/${user}/Kindle/${file}` : `/media/Kindle/${file}`;
		}
	}
}

export const DEFAULT_SETTINGS: KindleUsbSettings = {
	clippingsPath: '',
	folder: 'Kindle',
	includePage: true,
	books: {},
	ignoredBooks: [],
};

export function sanitizeSettings(raw: unknown): KindleUsbSettings {
	const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<KindleUsbSettings>;
	const books: Record<string, BookState> = {};
	if (data.books && typeof data.books === 'object') {
		for (const [key, value] of Object.entries(data.books)) {
			if (value && typeof value.path === 'string' && Array.isArray(value.seen)) {
				books[key] = { path: value.path, seen: value.seen.filter((s) => typeof s === 'string') };
			}
		}
	}
	return {
		clippingsPath:
			typeof data.clippingsPath === 'string' && data.clippingsPath.trim()
				? data.clippingsPath
				: defaultClippingsPath(),
		folder: typeof data.folder === 'string' ? data.folder : DEFAULT_SETTINGS.folder,
		includePage: typeof data.includePage === 'boolean' ? data.includePage : DEFAULT_SETTINGS.includePage,
		books,
		ignoredBooks: Array.isArray(data.ignoredBooks)
			? data.ignoredBooks.filter((s): s is string => typeof s === 'string')
			: [],
	};
}

export class KindleUsbSettingTab extends PluginSettingTab {
	plugin: KindleUsbPlugin;

	constructor(app: App, plugin: KindleUsbPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Arquivo My Clippings.txt')
			.setDesc('Caminho do arquivo no Kindle conectado por USB. Também dá para escolher outro arquivo na hora de importar.')
			.addText((text) =>
				text
					.setPlaceholder(defaultClippingsPath())
					.setValue(settings.clippingsPath)
					.onChange(async (value) => {
						settings.clippingsPath = value.trim() || defaultClippingsPath();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Pasta de destino')
			.setDesc('Pasta do cofre onde as notas dos livros são criadas. Notas que já existem continuam onde estão.')
			.addText((text) =>
				text
					.setPlaceholder('Kindle')
					.setValue(settings.folder)
					.onChange(async (value) => {
						try {
							settings.folder = normalizeFolder(value);
							await this.plugin.saveSettings();
						} catch (e) {
							new Notice(e instanceof Error ? e.message : String(e));
						}
					}),
			);

		new Setting(containerEl)
			.setName('Mostrar a página')
			.setDesc('Acrescenta "· page: N" depois da posição, quando o Kindle informa a página.')
			.addToggle((toggle) =>
				toggle.setValue(settings.includePage).onChange(async (value) => {
					settings.includePage = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Livros ignorados')
			.setDesc(`${settings.ignoredBooks.length} livro(s) desmarcado(s) em importações anteriores vêm desmarcados por padrão.`)
			.addButton((button) =>
				button.setButtonText('Limpar lista').onClick(async () => {
					settings.ignoredBooks = [];
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Histórico de importação')
			.setDesc(
				`${Object.keys(settings.books).length} livro(s) com histórico. O histórico impede que destaques apagados à mão voltem. Ao esquecê-lo, eles voltam na próxima importação.`,
			)
			.addButton((button) =>
				button
					.setButtonText('Esquecer histórico')
					.setWarning()
					.onClick(async () => {
						settings.books = {};
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}
}
