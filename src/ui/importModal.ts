import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { readFile, stat } from 'fs/promises';
import { executeImport, parseBooks, planImport, type BookPlan } from '../core/importer.ts';
import { MAX_CLIPPINGS_BYTES } from '../core/parser.ts';
import { ObsidianVault } from '../obsidianVault.ts';
import type KindleUsbPlugin from '../main.ts';

export async function readClippingsFromPath(path: string): Promise<string> {
	const info = await stat(path);
	if (!info.isFile()) throw new Error('O caminho não é um arquivo.');
	if (info.size > MAX_CLIPPINGS_BYTES) throw new Error('Arquivo grande demais para ser um My Clippings.txt.');
	return readFile(path, 'utf8');
}

export class ImportModal extends Modal {
	private plugin: KindleUsbPlugin;
	private path: string;
	private plans: BookPlan[] = [];
	private listEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private importButton?: ButtonComponent;
	private busy = false;

	constructor(app: App, plugin: KindleUsbPlugin) {
		super(app);
		this.plugin = plugin;
		this.path = plugin.settings.clippingsPath;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('kindle-usb-modal');
		this.setTitle('Importar destaques do Kindle (USB)');

		new Setting(contentEl)
			.setName('Arquivo')
			.setDesc('My Clippings.txt do Kindle conectado por USB.')
			.addText((text) =>
				text.setValue(this.path).onChange((value) => {
					this.path = value.trim();
				}),
			)
			.addButton((button) => button.setButtonText('Ler').onClick(() => void this.loadFromPath()))
			.addButton((button) => button.setButtonText('Escolher arquivo…').onClick(() => this.pickFile()));

		this.statusEl = contentEl.createDiv({ cls: 'kindle-usb-status' });
		this.listEl = contentEl.createDiv({ cls: 'kindle-usb-list' });

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Marcar com novidades').onClick(() => {
					for (const p of this.plans) p.selected = this.hasNews(p);
					this.renderList();
				}),
			)
			.addButton((button) =>
				button.setButtonText('Desmarcar todos').onClick(() => {
					for (const p of this.plans) p.selected = false;
					this.renderList();
				}),
			)
			.addButton((button) => {
				this.importButton = button;
				button
					.setButtonText('Importar')
					.setCta()
					.setDisabled(true)
					.onClick(() => void this.runImport());
			});

		void this.loadFromPath(true);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private hasNews(p: BookPlan): boolean {
		return p.newCount + p.updatedCount + p.notesAdded > 0;
	}

	private pickFile(): void {
		const input = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.txt,text/plain' } });
		input.addClass('kindle-usb-hidden');
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			input.remove();
			if (!file) return;
			if (file.size > MAX_CLIPPINGS_BYTES) {
				this.setStatus('Arquivo grande demais para ser um My Clippings.txt.', true);
				return;
			}
			file
				.text()
				.then((raw) => this.loadFromText(raw, file.name))
				.catch((e: unknown) => this.setStatus(`Não foi possível ler o arquivo: ${String(e)}`, true));
		});
		input.click();
	}

	private async loadFromPath(silent = false): Promise<void> {
		if (!this.path) {
			this.setStatus('Informe o caminho do My Clippings.txt ou escolha o arquivo.', true);
			return;
		}
		try {
			const raw = await readClippingsFromPath(this.path);
			if (this.path !== this.plugin.settings.clippingsPath) {
				this.plugin.settings.clippingsPath = this.path;
				await this.plugin.saveSettings();
			}
			await this.loadFromText(raw, this.path);
		} catch (e) {
			const code = (e as NodeJS.ErrnoException)?.code;
			const msg =
				code === 'ENOENT'
					? `Arquivo não encontrado em ${this.path}. O Kindle está conectado?`
					: `Não foi possível ler ${this.path}: ${e instanceof Error ? e.message : String(e)}`;
			this.setStatus(silent ? `${msg} Você também pode escolher o arquivo.` : msg, true);
		}
	}

	private async loadFromText(raw: string, source: string): Promise<void> {
		const books = parseBooks(raw);
		const vault = new ObsidianVault(this.app);
		this.plans = await planImport(books, vault, this.plugin.settings);
		const news = this.plans.filter((p) => this.hasNews(p)).length;
		this.setStatus(`${source}: ${books.length} livro(s) com destaques, ${news} com novidades.`, false);
		this.renderList();
	}

	private setStatus(text: string, error: boolean): void {
		this.statusEl.setText(text);
		this.statusEl.toggleClass('mod-warning', error);
	}

	private describe(p: BookPlan): string {
		const { stats } = p.book;
		const total = `${p.book.highlights.length} destaque(s)`;
		const dups = stats.duplicates ? `, ${stats.duplicates} repetido(s) descartado(s)` : '';
		const news: string[] = [];
		if (p.newCount) news.push(`${p.newCount} novo(s)`);
		if (p.updatedCount) news.push(`${p.updatedCount} ampliado(s)`);
		if (p.notesAdded) news.push(`${p.notesAdded} nota(s)`);
		const newsText = news.length ? news.join(', ') : 'sem novidades';
		switch (p.action) {
			case 'create':
				return `Nova nota: ${p.path} · ${total}${dups}`;
			case 'update':
				return `Atualizar ${p.path} · ${newsText}`;
			case 'amazon':
				return `Mesclar na nota da Amazon: ${p.path} · ${newsText}`;
		}
	}

	private renderList(): void {
		this.listEl.empty();
		for (const plan of this.plans) {
			const row = this.listEl.createDiv({ cls: 'kindle-usb-row' });
			const label = row.createEl('label');
			const box = label.createEl('input', { type: 'checkbox' });
			box.checked = plan.selected;
			box.addEventListener('change', () => {
				plan.selected = box.checked;
				plan.touched = true;
				this.updateButton();
			});
			const text = label.createDiv({ cls: 'kindle-usb-row-text' });
			text.createDiv({ cls: 'kindle-usb-title', text: plan.book.shortTitle });
			if (plan.book.author) text.createDiv({ cls: 'kindle-usb-author', text: plan.book.author });
			text.createDiv({ cls: 'kindle-usb-detail', text: this.describe(plan) });
		}
		this.updateButton();
	}

	private updateButton(): void {
		const n = this.plans.filter((p) => p.selected).length;
		this.importButton?.setButtonText(n ? `Importar (${n})` : 'Importar').setDisabled(n === 0 || this.busy);
	}

	private async runImport(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.updateButton();
		try {
			const outcome = await executeImport(this.plans, new ObsidianVault(this.app), this.plugin.settings);
			await this.plugin.saveSettings();
			const parts = [
				`${outcome.created} nota(s) criada(s)`,
				`${outcome.updated} atualizada(s)`,
				`${outcome.highlightsAdded} destaque(s) novo(s)`,
			];
			if (outcome.failures.length) {
				parts.push(`${outcome.failures.length} falha(s): ${outcome.failures.map((f) => f.title).join('; ')}`);
				console.error('[kindle-usb] falhas na importação', outcome.failures);
			}
			new Notice(`Kindle (USB): ${parts.join(', ')}.`, 8000);
			this.close();
		} catch (e) {
			this.setStatus(`Erro na importação: ${e instanceof Error ? e.message : String(e)}`, true);
		} finally {
			this.busy = false;
			this.updateButton();
		}
	}
}
