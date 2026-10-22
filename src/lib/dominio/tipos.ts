// Tipos do domínio. Valores em português porque aparecem na tela e no banco.

export const STATUS = ["recebido", "verificacao", "revisao", "aguardando_envio", "enviado", "recusado", "escalado"] as const;
export type Status = (typeof STATUS)[number];

export const STATUS_LABEL: Record<Status, string> = {
  recebido: "Recebido",
  verificacao: "Verificação",
  revisao: "Revisão humana",
  aguardando_envio: "Aguardando envio",
  enviado: "Enviado",
  recusado: "Recusado",
  escalado: "Escalado",
};

export type TipoCondicao = "DESCONTO_PERCENTUAL" | "VERBA_EXPOSICAO";

export const CATEGORIAS = [
  "GENERICOS",
  "MEDICAMENTOS_REFERENCIA",
  "MIP",
  "HIGIENE_BELEZA",
  "DERMOCOSMETICOS",
  "SUPLEMENTOS",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  GENERICOS: "Genéricos",
  MEDICAMENTOS_REFERENCIA: "Medicamentos de referência",
  MIP: "MIP (isentos de prescrição)",
  HIGIENE_BELEZA: "Higiene e beleza",
  DERMOCOSMETICOS: "Dermocosméticos",
  SUPLEMENTOS: "Suplementos",
};

// Certeza de cada campo lido pelo Extrator
export type Certeza = "escrito" | "deduzido" | "ausente";

export type Alternativa = { valor: string | number; origem: string; trecho: string };

export type Proveniencia = {
  certeza: Certeza;
  trecho: string;
  alternativas?: Alternativa[];
  sugestao?: { valor: string | number; motivo: string };
  // preenchido quando a pessoa altera o campo na revisão
  ajustado?: boolean;
  // a pessoa aceitou a sugestão do sistema (continua amarelo: é suposição)
  sugestaoAceita?: boolean;
  // nomes como vieram no e-mail, antes de virar código do ERP
  mencao?: string | string[];
  // como o nome virou código (ex.: "Méier → LOJA-107")
  resolucao?: string;
  // nomes que não achei no ERP
  pendentes?: string[];
};

export type CampoCondicao = "fornecedor" | "categoria" | "lojas" | "valor" | "data_inicio" | "data_fim" | "contrapartida";

export type Cor = "verde" | "amarelo" | "vermelho" | "cinza";
export type Grupo = "Leitura" | "Cadastro" | "Política" | "Contrato do ERP";

export type Farol = {
  codigo: string;
  grupo: Grupo;
  cor: Cor;
  titulo: string;
  detalhe: string;
  ref?: string;
  // ação sugerida quando vermelho não se resolve editando (ex.: escalar)
  acao?: "escalar" | "substituir";
};

export type Condicao = {
  id: number;
  ordem: number;
  tipo: TipoCondicao;
  titulo: string;
  codFornecedor: string | null;
  codCategoria: Categoria | null;
  lojas: string[];
  percentual: number | null;
  valor: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  contrapartida: string;
  campanhaSazonal: boolean;
  codCondicaoSubstituida: string | null;
  proveniencia: Partial<Record<CampoCondicao, Proveniencia>>;
  notas: string[];
};

export type VeredictoVerificador = "concorda" | "duvida" | "discorda";
export type ChecagemVerificador = { condicao: number; campo: CampoCondicao; veredito: VeredictoVerificador; comentario: string };

export type Aprovador = { matricula: string; nome: string; cargo: string; nivel: number };
