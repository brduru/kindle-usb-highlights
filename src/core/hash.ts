/**
 * Fletcher-16 sobre os bytes UTF-8 do texto em minúsculas.
 *
 * É o mesmo algoritmo que o plugin "Kindle Highlights" (hadynz/obsidian-kindle-plugin)
 * usa para gerar `bookId` e os IDs `^ref-NNNNN`. Reproduzi-lo mantém as notas
 * novas no mesmo formato das existentes no vault.
 */
export function fletcher16(input: string): number {
	const bytes = new TextEncoder().encode(input.toLowerCase());
	let sum1 = 255;
	let sum2 = 255;
	let idx = 0;
	let len = bytes.length;
	while (len) {
		let block = len > 20 ? 20 : len;
		len -= block;
		do {
			sum1 += bytes[idx++] ?? 0;
			sum2 += sum1;
		} while (--block);
		sum1 = (sum1 & 255) + (sum1 >> 8);
		sum2 = (sum2 & 255) + (sum2 >> 8);
	}
	sum1 = (sum1 & 255) + (sum1 >> 8);
	sum2 = (sum2 & 255) + (sum2 >> 8);
	return (sum2 << 8) | sum1;
}

/**
 * Hash de 53 bits (cyrb53), usado só como chave interna de "já importado".
 * Os 16 bits do Fletcher colidem com facilidade, então não servem para isso.
 */
export function cyrb53(str: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Normaliza texto para comparação: NFC, espaços colapsados, minúsculas. */
export function normalizeText(s: string): string {
	return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Chave estável de "destaque já visto" a partir do texto normalizado. */
export function seenKey(text: string): string {
	return cyrb53(normalizeText(text));
}
