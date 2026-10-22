CREATE TABLE `chamadas_ia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negociacao_id` integer NOT NULL,
	`tarefa_id` integer,
	`tentativa` integer,
	`em` integer NOT NULL,
	`origem` text NOT NULL,
	`gerado_em` text,
	`registro` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chamadas_ia_neg` ON `chamadas_ia` (`negociacao_id`);