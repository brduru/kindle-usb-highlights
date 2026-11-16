/**
 * `My Clippings.txt` sintético (textos inventados), no formato de um Kindle em
 * português, com BOM e CRLF como no aparelho.
 */
const BOM = '﻿';
const SEP = '==========';

export interface Entry {
	title: string;
	meta: string;
	text?: string;
}

export function makeClippings(entries: Entry[]): string {
	return entries
		.map((e) => `${BOM}${e.title}\r\n${e.meta}\r\n\r\n${e.text ?? ''}\r\n${SEP}\r\n`)
		.join('');
}

const LIVRO = 'Livro de Teste: Um subtítulo qualquer (Silva, Ana)';
const OUTRO = 'Outro Livro (Ana Souza;Beatriz Lima;Carla Dias)';
const EN = 'English Book (Doe, John)';

export const SAMPLE = makeClippings([
	{
		title: LIVRO,
		meta: '- Seu marcador na página 2 | posição 20 | Adicionado: sábado, 19 de dezembro de 2020 00:51:42',
	},
	{
		title: LIVRO,
		meta: '- Seu destaque na página 19 | posição 280-281 | Adicionado: sexta-feira, 13 de novembro de 2026 18:08:34',
		text: 'A liberdade exige atenção.',
	},
	{
		// Ajuste do destaque anterior (versão mais longa, contém a primeira).
		title: LIVRO,
		meta: '- Seu destaque na página 19 | posição 279-282 | Adicionado: sexta-feira, 13 de novembro de 2026 18:09:00',
		text: 'Primeira frase. A liberdade exige atenção. Segunda frase.',
	},
	{
		// Duplicata exata.
		title: LIVRO,
		meta: '- Seu destaque na página 19 | posição 279-282 | Adicionado: sexta-feira, 13 de novembro de 2026 18:09:10',
		text: 'Primeira frase. A liberdade exige atenção. Segunda frase.',
	},
	{
		title: LIVRO,
		meta: '- Sua nota na página 19 | posição 281 | Adicionado: sexta-feira, 13 de novembro de 2026 18:10:00',
		text: 'Nota antiga',
	},
	{
		title: LIVRO,
		meta: '- Sua nota na página 19 | posição 282 | Adicionado: sexta-feira, 13 de novembro de 2026 18:11:00',
		text: 'Minha nota final',
	},
	{
		// Vizinho que só compartilha a posição de fronteira: é outro destaque.
		title: LIVRO,
		meta: '- Seu destaque na página 20 | posição 282-290 | Adicionado: sábado, 14 de novembro de 2026 09:00:00',
		text: 'Um trecho vizinho que começa onde o outro termina.',
	},
	{
		title: LIVRO,
		meta: '- Seu destaque ou posição 100-101 | Adicionado: sábado, 14 de novembro de 2026 09:05:00',
		text: 'Um destaque sem página no começo do livro.',
	},
	{
		title: LIVRO,
		meta: '- Sua nota na página 50 | posição 700 | Adicionado: domingo, 15 de novembro de 2026 10:00:00',
		text: 'Nota solta sem destaque',
	},
	{
		title: OUTRO,
		meta: '- Seu destaque na página 3 | posição 40-41 | Adicionado: domingo, 1 de março de 2026 10:00:00',
		text: 'Texto do outro livro.',
	},
	{
		title: EN,
		meta: '- Your Highlight on page 7 | Location 105-106 | Added on Friday, November 13, 2026 6:08:34 PM',
		text: 'An English highlight.',
	},
	{
		title: 'Só Marcadores (Ninguém)',
		meta: '- Seu marcador ou posição 869 | Adicionado: sábado, 19 de dezembro de 2020 00:51:42',
	},
]);
