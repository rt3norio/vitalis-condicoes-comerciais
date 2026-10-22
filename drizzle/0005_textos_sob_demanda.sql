ALTER TABLE `negociacoes` ADD `textos_meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- D20: textos para enviar passam a ser gerados na tela; os gerados automaticamente antes não têm quem/quando
UPDATE `negociacoes` SET `rascunho_fornecedor` = NULL, `memorando` = NULL;
