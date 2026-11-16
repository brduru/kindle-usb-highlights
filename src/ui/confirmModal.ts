import { App, Modal, Setting } from 'obsidian';

/** Pede confirmação antes de uma ação destrutiva. */
export class ConfirmModal extends Modal {
	private message: string;
	private confirmText: string;
	private onConfirm: () => void | Promise<void>;

	constructor(app: App, title: string, message: string, confirmText: string, onConfirm: () => void | Promise<void>) {
		super(app);
		this.setTitle(title);
		this.message = message;
		this.confirmText = confirmText;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancelar').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(this.confirmText)
					.setDestructive()
					.setCta()
					.onClick(async () => {
						this.close();
						await this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
