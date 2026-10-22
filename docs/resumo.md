# Cadastro de condições comerciais com IA

Vitalis · Case AI Builder (Pareto) · 22/10/2026 · [A PREENCHER: nome e e-mail do autor]

> Estas duas primeiras páginas foram revisadas para leitura humana e trazem os pontos mais importantes, para avaliar por leitura direta. O restante do documento, a partir da página 3, é longo e detalhado e deve ser lido por IA.

O e-mail do fornecedor vira condição gravada no ERP, com uma pessoa decidindo no meio.

**E-mail → IA lê → segunda IA confere → regras fixas (hardcoded) da política e do ERP → pessoa com alçada aprova → ERP**

Solução: [vitalis-condicoes.fly.dev](https://vitalis-condicoes.fly.dev) · Vídeo: [A PREENCHER: link do vídeo]

## O que a solução garante

- Nada vai ao ERP sem a aprovação de uma pessoa com alçada.
- Quando o ERP cai, o sistema tenta de novo sozinho e nunca grava duas vezes. Num teste, o ERP falhou 4 vezes e a condição foi gravada na 5ª tentativa.
- Cada campo mostra o trecho do e-mail de onde veio. O que foi deduzido precisa da ciência de alguém antes da aprovação, com nome e hora.

## Onde usa IA e onde não

A IA lê o e-mail e a planilha, uma segunda IA confere a leitura e a IA escreve o resumo e as respostas. Teto, alçada, vigência, sobreposição e fornecedor ativo (POL-COM-004) são regras fixas (hardcoded) no sistema, sem IA, e quem aprova é sempre uma pessoa.

## Decisões de desenho

### Processo

- O processo é assíncrono porque não é transacional: ninguém fica esperando na tela a gravação no ERP. Por isso tudo é tarefa: fica gravada no banco, roda em segundo plano a cada minuto e, se falhar, tenta de novo na rodada seguinte.
- O e-mail anda por 5 status (Recebido, Verificação, Revisão humana, Aguardando envio, Enviado), como um ticket que troca de raia.
- As condições de um e-mail vão juntas ao ERP (premissa a validar). Antes do envio, tudo é reconferido com o ERP.
- O ERP é consultado antes da IA, para não jogar leitura fora quando ele cai.

### Revisão e aprovação

- Sempre há revisão humana, com três saídas: aprovar, recusar ou escalar.
- Sem a alçada da condição, só leitura. Escalar ou recusar o e-mail inteiro pede a maior alçada; desconto vedado fica com a Diretoria (§11).
- "Quem você é", no topo e sem login, assina aprovações, ciências e escalonamentos. Caso escalado só a Diretoria e o Comitê veem.
- Cada item amarelo tem o próprio "Dar ciência", ao lado da dica do campo, para que a pessoa não possa dizer que "não viu" o que aceitou.

### IA

- Três agentes: o Extrator lê, o Verificador confere e o Redator escreve. Modelo GLM-5.3, escolhido por teste (cerca de US$ 0,006 por e-mail).
- Os 4 e-mails do exemplo usam a leitura real da IA gravada uma vez: reiniciar não gasta.
- Resposta ao fornecedor e memorando são gerados quando a pessoa pede. O resumo é refeito a cada mudança e diz o que mudou.
- Tudo fica gravado em "Detalhes para auditoria", inclusive o retorno bruto da IA.
- Texto suspeito é marcado e escalado, sem expor o trecho. A proposta não segue e o fornecedor precisa mandar outra.

### Tela

- Painel: uma tabela só, filtrada pelos botões de status, sem faróis.
- Negociação: resumo em tópicos, e-mail e textos recolhidos, uma bolinha por campo e a auditoria no fim.
- Faróis verde, amarelo e vermelho; cinza só em regra da política que não se aplica.

### Demonstração

- Fly.io, com SQLite num disco e uma máquina sempre ligada.
- Cada visitante tem a sua demo, que começa em Recebido, com "Processar agora" e "Reiniciar demo".
- E-mails novos entram por "Novo e-mail" ou "Gerar novos e-mails (IA)", com limite por sessão.
- Data de operação real, Alfa escalada à Diretoria e dúvidas de negócio registradas (abaixo).
- Funcionalidades até as 15h de 22/10; depois, só documentação, vídeo e publicação.

Cada decisão, com contexto, opções e consequência, está na seção 08 do documento completo.

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

O ponto mais importante agora é sentar ao lado de um analista comercial e ver o que olha em cada e-mail, que dados busca no ERP e como os obtém. Com isso, entender junto como tornar a ferramenta mais natural no dia a dia e trazer esses dados para ela, a ponto de não ser preciso abrir o ERP para consultar nada. Com todo o contexto na tela, a decisão fica melhor. Depois, validar os pontos acima com a área, fazer um piloto (Outlook, SAP de testes e um time comercial) e ir para produção no Azure, com login da empresa e aviso ao aprovador no Teams.
