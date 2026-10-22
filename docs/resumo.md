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

## Para validar com a área

<div class="colunas">

1. **Data passada:** quando o início pedido já passou, combina-se nova data ou recusa-se?
2. **Alfa (28%, "campanha sazonal"):** vale a nota (*) da §4, até 30% com Trade Marketing, ou a §5, que veda acima de 25%?
3. **Verba da Gama:** a alçada é pelo total (R$ 8.000) ou por loja (R$ 2.000)?
4. **Desconto da Gama:** vale 12% (e-mail) ou 12,5% (planilha)?
5. **Gama sem data de fim:** sugerir 31/12 ou esperar o fornecedor?
6. **Lojas da Gama:** Copacabana, Ipanema, Leblon e Barra são as lojas 101, 102, 103 e 109? A contrapartida vale também para o desconto?
7. **Beta:** a COND-003 passou de 10% para 11% depois do e-mail. A Beta sabe? "HPC" é Higiene e Beleza?
8. **Fornecedor inativo (Nutrivida):** bloquear antes do ERP ou aprovar e esperar a regularização?
9. **Sobreposição (§9):** vale entre tipos diferentes, como desconto e verba nas mesmas lojas?
10. **Aprovadores:** quem são, por alçada, com nome e matrícula?
11. **Pacote:** as condições de um mesmo e-mail valem separadas ou só juntas?
12. **Texto suspeito:** quem recebe (Diretoria, Compliance, TI)? O fornecedor é avisado? A proposta morre?

</div>

## Próximos passos

**Validar com a área** os pontos acima → **piloto** com a caixa do Outlook, o SAP de testes e um time comercial → **produção** no Azure, com login da empresa e aviso ao aprovador no Teams.
