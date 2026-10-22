CREATE TABLE `eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negociacao_id` integer NOT NULL,
	`em` integer NOT NULL,
	`por` text NOT NULL,
	`descricao` text NOT NULL
);
