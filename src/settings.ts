import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { userInfo } from 'os';
import type { BookState } from './core/importer.ts';
import { normalizeFolder } from './core/importer.ts';
import type KindleUsbPlugin from './main.ts';
import { ConfirmModal } from './ui/confirmModal.ts';

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

type ControlKey = 'clippingsPath' | 'folder' | 'includePage';

export class KindleUsbSettingTab extends PluginSettingTab {
	plugin: KindleUsbPlugin;

	constructor(app: App, plugin: KindleUsbPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		const settings = this.plugin.settings;
		const ignored = settings.ignoredBooks.length;
		const books = Object.keys(settings.books).length;
		return [
			{
				name: 'Arquivo My Clippings.txt',
				desc: 'Caminho do arquivo no Kindle conectado por USB. Também dá para escolher outro arquivo na hora de importar.',
				aliases: ['kindle', 'clippings', 'usb'],
				control: { type: 'text', key: 'clippingsPath', placeholder: defaultClippingsPath() },
			},
			{
				name: 'Pasta de destino',
				desc: 'Pasta do cofre onde as notas dos livros são criadas. Notas que já existem continuam onde estão.',
				control: {
					type: 'folder',
					key: 'folder',
					placeholder: 'Kindle',
					validate: (value) => {
						try {
							normalizeFolder(value);
							return undefined;
						} catch (e) {
							return e instanceof Error ? e.message : String(e);
						}
					},
				},
			},
			{
				name: 'Mostrar a página',
				desc: 'Acrescenta "· page: N" depois da posição, quando o Kindle informa a página.',
				control: { type: 'toggle', key: 'includePage' },
			},
			{
				name: 'Limpar a lista de livros ignorados',
				desc: `${ignored} livro(s) desmarcado(s) à mão em importações anteriores vêm desmarcados por padrão.`,
				disabled: ignored === 0,
				action: () => {
					settings.ignoredBooks = [];
					void this.plugin.saveSettings().then(() => this.update());
				},
			},
			{
				name: 'Esquecer o histórico de importação',
				desc: `${books} livro(s) com histórico. O histórico impede que destaques apagados à mão voltem; sem ele, eles voltam na próxima importação.`,
				disabled: books === 0,
				action: () => {
					new ConfirmModal(
						this.app,
						'Esquecer o histórico de importação?',
						'Destaques que você apagou à mão das notas voltarão na próxima importação. As notas não são alteradas agora.',
						'Esquecer histórico',
						async () => {
							settings.books = {};
							await this.plugin.saveSettings();
							this.update();
						},
					).open();
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		const settings = this.plugin.settings;
		if (key === 'clippingsPath') return settings.clippingsPath;
		if (key === 'folder') return settings.folder;
		if (key === 'includePage') return settings.includePage;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		if (key === 'clippingsPath' && typeof value === 'string') {
			settings.clippingsPath = value.trim() || defaultClippingsPath();
		} else if (key === 'folder' && typeof value === 'string') {
			try {
				settings.folder = normalizeFolder(value);
			} catch {
				return; // validate() já mostra o erro ao lado do campo
			}
		} else if (key === 'includePage' && typeof value === 'boolean') {
			settings.includePage = value;
		} else {
			return;
		}
		await this.plugin.saveSettings();
	}
}
