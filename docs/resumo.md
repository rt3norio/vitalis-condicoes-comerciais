# Cadastro de condições comerciais com IA

Vitalis · Case AI Builder (Pareto) · 22/10/2026 · [A PREENCHER: nome e e-mail do autor]

O e-mail do fornecedor vira condição gravada no ERP, com uma pessoa decidindo no meio.

**E-mail → IA lê → segunda IA confere → regras fixas (hardcoded) da política e do ERP → pessoa com alçada aprova → ERP**

Solução: [A PREENCHER: link da solução] · Vídeo: [A PREENCHER: link do vídeo] · Documento completo: entrega.pdf

## O que a solução garante

- Nada vai ao ERP sem a aprovação de uma pessoa com alçada.
- Quando o ERP cai, o sistema tenta de novo sozinho e nunca grava a mesma condição duas vezes. Num teste, o ERP falhou 4 vezes seguidas e a condição foi gravada na 5ª tentativa.
- Cada campo mostra o trecho do e-mail de onde veio. O que foi deduzido precisa da ciência de alguém antes da aprovação, com nome e hora.

## Onde usa IA e onde não

A IA lê o e-mail e a planilha, uma segunda IA confere essa leitura, e a IA também escreve o resumo e as respostas ao fornecedor. Teto, alçada, vigência, sobreposição e fornecedor ativo (POL-COM-004) são conferidos por regras fixas (hardcoded) no sistema, sem IA, e quem aprova é sempre uma pessoa.

## Três decisões de desenho

1. Cada etapa é uma tarefa que roda a cada minuto. Se falha, a falha fica registrada e a tarefa roda de novo na rodada seguinte.
2. Um e-mail que tenta comandar o sistema é marcado e escalado à Diretoria. Aquela proposta não segue: o fornecedor precisa mandar outra.
3. Escolhi o modelo por teste. O GLM-5.3 custa cerca de US$ 0,006 por e-mail; os modelos mais baratos que testei erraram a leitura.

## Para validar com a área

<div class="colunas">

1. Quando o início pedido já passou, combina-se nova data ou recusa-se a proposta?
2. Na Alfa (28% numa "campanha sazonal"), vale a nota (*) da §4, que admite até 30% com o Trade Marketing, ou a §5, que veda acima de 25%?
3. A alçada da verba da Gama é pelo total (R$ 8.000) ou por loja (R$ 2.000)?
4. O desconto da Gama é 12%, como diz o e-mail, ou 12,5%, como diz a planilha?
5. A Gama não deu data de fim. Sugerimos 31/12 ou esperamos o fornecedor?
6. Copacabana, Ipanema, Leblon e Barra são as lojas 101, 102, 103 e 109? A contrapartida da Gama vale também para o desconto?
7. A COND-003 passou de 10% para 11% depois do e-mail da Beta. A Beta sabe? "HPC" é Higiene e Beleza?
8. Com a Nutrivida inativa, bloqueamos antes do ERP ou aprovamos e esperamos a regularização?
9. A proibição de sobreposição (§9) vale entre tipos diferentes, como desconto e verba nas mesmas lojas?
10. Quem são os aprovadores de cada alçada, com nome e matrícula?
11. As condições de um mesmo e-mail valem separadas ou só juntas?
12. Quando há texto suspeito, quem recebe o caso (Diretoria, Compliance, TI)? O fornecedor é avisado? A proposta morre?

</div>

## Próximos passos

Primeiro, validar os pontos acima com a área. Depois, um piloto com a caixa do Outlook, o SAP de testes e um time comercial. Por fim, a produção no Azure, com login da empresa e aviso ao aprovador no Teams.
