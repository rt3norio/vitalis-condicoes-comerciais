# Cadastro de condições comerciais com IA

Vitalis · Case AI Builder (Pareto) · 22/10/2026 · [A PREENCHER: nome e e-mail do autor]

O e-mail do fornecedor vira condição gravada no ERP, com uma pessoa decidindo no meio.

**E-mail → IA lê → segunda IA confere → regras fixas (hardcoded) da política e do ERP → pessoa com alçada aprova → ERP**

Solução: [vitalis-condicoes.fly.dev](https://vitalis-condicoes.fly.dev) · Vídeo: [A PREENCHER: link do vídeo] · Documento completo: entrega.pdf

## O que a solução garante

- Nada vai ao ERP sem a aprovação de uma pessoa com alçada.
- Quando o ERP cai, o sistema tenta de novo sozinho e nunca grava duas vezes. Num teste, o ERP falhou 4 vezes e a condição foi gravada na 5ª tentativa.
- Cada campo mostra o trecho do e-mail de onde veio. O que foi deduzido precisa da ciência de alguém antes da aprovação, com nome e hora.

## Onde usa IA e onde não

A IA lê o e-mail e a planilha, uma segunda IA confere a leitura e a IA escreve o resumo e as respostas. Teto, alçada, vigência, sobreposição e fornecedor ativo (POL-COM-004) são regras fixas (hardcoded) no sistema, sem IA, e quem aprova é sempre uma pessoa.

## Decisões de desenho

### Processo

1. Cada etapa é uma tarefa gravada no banco e executada em segundo plano a cada minuto, num funil de 5 status (Recebido, Verificação, Revisão humana, Aguardando envio, Enviado), como um ticket que troca de raia. Se falha, a falha fica registrada e a tarefa roda de novo na rodada seguinte.
2. A unidade de trabalho é o e-mail (a negociação). As condições de um mesmo e-mail são um pacote e vão juntas ao ERP, uma premissa a validar com a área.
3. Antes do primeiro envio, o sistema reconfere tudo com o ERP. Se uma condição for recusada, a negociação volta para revisão dizendo o que já foi gravado.
4. O ERP é consultado antes da IA: com o ERP fora, nenhuma leitura é jogada fora e a falha aparece como do ERP.

### Revisão e aprovação

5. A revisão humana é obrigatória e tem três saídas: aprovar, recusar ou escalar.
6. A hierarquia segue a alçada: quem não tem a alçada de uma condição só vê (não edita, não dá ciência, não aprova). Escalar ou recusar o e-mail inteiro pede a maior alçada do pacote; desconto vedado fica com a Diretoria (§11).
7. "Quem você é", no topo e sem login, define em nome de quem se aprova, dá ciência e escala. Um caso escalado só a Diretoria e o Comitê veem.
8. Cada item amarelo pede "Dar ciência" próprio, ao lado da dica do campo, no lugar de uma caixa única de "conferi tudo".

### IA

9. Três agentes: o Extrator lê, o Verificador confere sem ver o raciocínio do primeiro e o Redator escreve. Escolhi o modelo por teste: o GLM-5.3 custa cerca de US$ 0,006 por e-mail, e os mais baratos que testei erraram a leitura.
10. Os 4 e-mails do exemplo usam a leitura real da IA gravada uma vez, então reiniciar não gasta. A IA roda ao vivo em e-mail novo, quando alguém corrige algo e quando alguém pede um texto.
11. As respostas ao fornecedor e o memorando à Diretoria são gerados quando a pessoa pede, sobre o estado atual. O resumo é refeito a cada correção, aprovação e envio, dizendo o que mudou em relação ao e-mail.
12. Tudo fica gravado (tarefas, falhas, novas tentativas, quem deu ciência, editou ou aprovou, e cada chamada de IA com o que recebeu e devolveu) e aparece em "Detalhes para auditoria", recolhido. A auditoria mantém o retorno bruto da IA.
13. Um e-mail que tenta comandar o sistema é marcado como texto suspeito e escalado à Diretoria, sem expor o trecho na tela. Aquela proposta não segue: o fornecedor precisa mandar outra.

### Tela

14. O Painel é uma tabela única em que os botões de status filtram a mesma tabela, sem faróis, para não poluir.
15. A negociação mostra primeiro o mínimo para decidir: o resumo em tópicos, o e-mail original recolhido com os textos para enviar logo abaixo, e uma bolinha por campo com a dica em tópicos ("confira ⓘ"). Os detalhes de auditoria ficam recolhidos no fim.
16. Os faróis são verde, amarelo (deduzido, pede ciência) e vermelho (trava). O cinza aparece só nas regras da política que não se aplicam àquela condição.

### Demonstração

17. Publicado no Fly.io, com SQLite num disco e uma máquina sempre ligada, porque o agendador roda nela. Cada visitante tem a sua demonstração, que começa em Recebido, com "Processar agora" e "Reiniciar demo".
18. E-mails novos entram por "Novo e-mail" (colar ou subir .eml) ou por "Gerar novos e-mails (IA)", com limite por sessão.
19. A data de operação é a data real, a Alfa vai para a Diretoria e as dúvidas de negócio ficaram registradas (abaixo).
20. Funcionalidades até as 15h de 22/10; depois, só documentação, vídeo e publicação.

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

Validar os pontos acima com a área, fazer um piloto (Outlook, SAP de testes e um time comercial) e ir para produção no Azure, com login da empresa e aviso ao aprovador no Teams.
