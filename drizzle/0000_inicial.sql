CREATE TABLE `condicoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negociacao_id` integer NOT NULL,
	`ordem` integer NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`cod_fornecedor` text,
	`cod_categoria` text,
	`lojas` text DEFAULT '[]' NOT NULL,
	`percentual` real,
	`valor` real,
	`data_inicio` text,
	`data_fim` text,
	`contrapartida` text DEFAULT '' NOT NULL,
	`campanha_sazonal` integer DEFAULT false NOT NULL,
	`cod_condicao_substituida` text,
	`proveniencia` text DEFAULT '{}' NOT NULL,
	`notas` text DEFAULT '[]' NOT NULL,
	`aprovador` text,
	`aprovada_em` integer,
	`idempotency_key` text,
	`erp_cod_condicao` text,
	`erp_resposta` text,
	`enviada_em` integer
);
--> statement-breakpoint
CREATE TABLE `erp_chamadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`em` integer NOT NULL,
	`metodo` text NOT NULL,
	`caminho` text NOT NULL,
	`status` integer NOT NULL,
	`erro` text
);
--> statement-breakpoint
CREATE INDEX `erp_chamadas_sessao` ON `erp_chamadas` (`session_id`,`em`);--> statement-breakpoint
CREATE TABLE `erp_condicoes` (
	`session_id` text NOT NULL,
	`cod_condicao` text NOT NULL,
	`dados` text NOT NULL,
	PRIMARY KEY(`session_id`, `cod_condicao`)
);
--> statement-breakpoint
CREATE TABLE `erp_fornecedores` (
	`session_id` text NOT NULL,
	`cod_fornecedor` text NOT NULL,
	`dados` text NOT NULL,
	PRIMARY KEY(`session_id`, `cod_fornecedor`)
);
--> statement-breakpoint
CREATE TABLE `erp_idempotencia` (
	`session_id` text NOT NULL,
	`chave` text NOT NULL,
	`resposta` text NOT NULL,
	`criada_em` integer NOT NULL,
	PRIMARY KEY(`session_id`, `chave`)
);
--> statement-breakpoint
CREATE TABLE `erp_lojas` (
	`session_id` text NOT NULL,
	`cod_loja` text NOT NULL,
	`dados` text NOT NULL,
	PRIMARY KEY(`session_id`, `cod_loja`)
);
--> statement-breakpoint
CREATE TABLE `farois` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negociacao_id` integer NOT NULL,
	`condicao_id` integer,
	`codigo` text NOT NULL,
	`grupo` text NOT NULL,
	`cor` text NOT NULL,
	`titulo` text NOT NULL,
	`detalhe` text NOT NULL,
	`ref` text,
	`acao` text,
	`calculado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lease` (
	`nome` text PRIMARY KEY NOT NULL,
	`dono` text,
	`ate` integer,
	`ultima_rodada_em` integer
);
--> statement-breakpoint
CREATE TABLE `leituras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negociacao_id` integer NOT NULL,
	`origem` text NOT NULL,
	`modelo_extrator` text,
	`modelo_verificador` text,
	`saida_extrator` text NOT NULL,
	`saida_verificador` text,
	`criada_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `negociacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'recebido' NOT NULL,
	`origem` text NOT NULL,
	`chave_dataset` text,
	`message_id` text NOT NULL,
	`remetente` text NOT NULL,
	`dominio` text DEFAULT '' NOT NULL,
	`assunto` text NOT NULL,
	`recebido_em` integer NOT NULL,
	`corpo` text NOT NULL,
	`bruto` text NOT NULL,
	`anexos` text DEFAULT '[]' NOT NULL,
	`leitura_atual_id` integer,
	`forcar_leitura_ia` integer DEFAULT false NOT NULL,
	`instrucoes_suspeitas` text DEFAULT '[]' NOT NULL,
	`resumo` text,
	`rascunho_fornecedor` text,
	`memorando` text,
	`textos_origem` text,
	`conferidos` text,
	`motivo_saida` text,
	`alerta_revisao` text,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `neg_sessao_status` ON `negociacoes` (`session_id`,`status`);--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` text PRIMARY KEY NOT NULL,
	`criada_em` integer NOT NULL,
	`ultimo_acesso` integer NOT NULL,
	`emails_colados` integer DEFAULT 0 NOT NULL,
	`erp_snapshot` text,
	`erp_snapshot_em` integer
);
--> statement-breakpoint
CREATE TABLE `tarefas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`negociacao_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`proxima_em` integer NOT NULL,
	`lease_ate` integer,
	`ultimo_erro` text,
	`criada_em` integer NOT NULL,
	`atualizada_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tarefa_fila` ON `tarefas` (`status`,`proxima_em`);--> statement-breakpoint
CREATE TABLE `tentativas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`negociacao_id` integer NOT NULL,
	`n` integer NOT NULL,
	`inicio` integer NOT NULL,
	`fim` integer NOT NULL,
	`resultado` text NOT NULL,
	`http_status` integer,
	`mensagem` text NOT NULL
);
