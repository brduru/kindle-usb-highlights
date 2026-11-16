import { Plugin } from 'obsidian';
import { KindleUsbSettingTab, sanitizeSettings, type KindleUsbSettings } from './settings.ts';
import { ImportModal } from './ui/importModal.ts';

export default class KindleUsbPlugin extends Plugin {
	settings!: KindleUsbSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addRibbonIcon('book-down', 'Importar destaques do Kindle (USB)', () => this.openImport());

		this.addCommand({
			id: 'import-my-clippings',
			name: 'Importar destaques do Kindle (USB)',
			callback: () => this.openImport(),
		});

		this.addSettingTab(new KindleUsbSettingTab(this.app, this));
	}

	openImport(): void {
		new ImportModal(this.app, this).open();
	}

	async loadSettings(): Promise<void> {
		this.settings = sanitizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
