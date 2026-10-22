# Cadastro de condições comerciais com IA

Vitalis · Case AI Builder (Pareto) · 22/10/2026 · [A PREENCHER: nome e e-mail do autor]

O e-mail do fornecedor vira condição gravada no ERP, com uma pessoa decidindo no meio.

**E-mail → IA lê → segunda IA confere → regras da política e do ERP → pessoa com alçada aprova → ERP**

Solução: [A PREENCHER: link da solução] · Vídeo: [A PREENCHER: link do vídeo] · Documento completo: entrega.pdf

## O que a solução garante

- **Nada vai ao ERP sem uma pessoa com alçada aprovar.**
- **Continua de pé quando o ERP cai.** Tenta de novo sozinha e nunca grava duas vezes. Num teste, o ERP falhou 4 vezes seguidas e a condição foi gravada na 5ª tentativa.
- **Toda suposição fica visível.** Cada campo mostra o trecho do e-mail de onde veio; o que foi deduzido pede ciência, com nome e hora.

## Onde usa IA e onde não

- **IA:** lê o e-mail e a planilha; uma segunda IA confere essa leitura; e a IA escreve o resumo e as respostas.
- **Regra fixa:** teto, alçada, vigência, sobreposição e fornecedor ativo (POL-COM-004). Quem aprova é sempre uma pessoa.

## 3 decisões-chave

1. **Cada etapa é uma tarefa com nova tentativa**, a cada minuto. O cadastro não precisa ser instantâneo; precisa não se perder.
2. **E-mail que tenta comandar o sistema é marcado e escalado à Diretoria.** Aquela proposta não segue; o fornecedor manda outra.
3. **Modelo escolhido por teste medido.** O GLM-5.3 custa ~US$ 0,006 por e-mail; os mais baratos testados erraram a leitura.

## Próximos passos

1. **Validar com a área** as 12 dúvidas de negócio (ex.: a alçada da verba é pelo total ou por loja?). 2 semanas.
2. **Piloto** com a caixa do Outlook, o SAP de testes e um time comercial. 4 a 6 semanas.
3. **Produção** no Azure, com login da empresa e aviso ao aprovador no Teams. 4 semanas.
