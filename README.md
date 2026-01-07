# Modo Pokemon Skill Alexa

Skill de voz para Alexa inspirada em Pokemon, com captura, batalhas selvagens,
modo ginasio, progressao e recompensas.

## Principais recursos
- Captura de Pokemon usando a PokeAPI.
- Batalha por turnos (atacar, especial, defender, item, fugir).
- Modo ginasio com 5 batalhas + lider.
- Progressao com XP, level e pontos de atributo.
- Recompensas e inventario (pocao e super pocao).
- Reset de progresso por voz com confirmacao.

## Comandos de voz
Veja o arquivo `COMMANDS.txt` para a lista completa de comandos e o que cada um faz.

## Requisitos
- Node.js 16+
- Conta AWS (Lambda + DynamoDB)
- Alexa Skills Kit (ASK)

## Configuracao
1) Instale as dependencias:
   - `cd lambda`
   - `npm install`
2) Configure as variaveis de ambiente da Lambda:
   - `DYNAMODB_PERSISTENCE_TABLE_NAME`
   - `DYNAMODB_PERSISTENCE_REGION`
3) Publique a Lambda e a Interaction Model do `skill-package`.

## Estrutura do projeto
- `lambda/` - codigo da skill (Node.js).
- `skill-package/` - interaction model e manifest da skill.
- `COMMANDS.txt` - comandos de voz e explicacoes.

## Testes rapidos
Exemplos de fluxo:
- "modo pokemon" -> "cacar pokemon" -> "capturar"
- "modo batalha" -> "atacar" / "especial" / "defender" / "usar item" / "fugir"
- "entrar no ginasio" -> "sim" para iniciar

## Observacoes
- A PokeAPI e usada para sorteios e dados de Pokemon.
- O progresso do usuario e salvo no DynamoDB.


Comandos de voz e o que fazem

Invocacao
- "modo pokemon" / "abrir modo pokemon" - abre a skill.

Captura e exploracao
- "cacar pokemon" / "procurar pokemon" / "encontrar pokemon" / "sorteio" - sorteia um pokemon para capturar.
- "capturar" / "tentar capturar" - tenta capturar o pokemon encontrado.
- "tentar novamente" / "tentar outro" - sorteia outro pokemon (se voce ainda nao capturou).

Batalha selvagem (modo batalha)
- "modo batalha" / "batalha" - inicia uma batalha selvagem.
- "atacar" / "ataque rapido" - ataque rapido.
- "especial" / "ataque especial" / "golpe especial" - ataque especial (usa energia).
- "defender" / "defesa" - defende e ganha energia.
- "usar item" - pergunta qual item usar.
- "usar pocao" / "pocao" - usa pocao.
- "usar super pocao" / "super pocao" - usa super pocao.
- "fugir" / "correr" - tenta fugir da batalha.
- "status" / "minha vida" - fala o HP atual do jogador e do inimigo.

Ginasio
- "entrar no ginasio" / "modo ginasio" - inicia ou continua um ginasio.
- "atacar" / "especial" / "defender" / "usar item" / "fugir" - acoes no turno do ginasio.

Progressao
- "vida" / "ataque" / "especial" / "defesa" / "defesa especial" / "velocidade" / "desvio" - aloca ponto quando o jogo pede atributo.
- "geracao 2" / "mudar para geracao 3" - define a geracao ativa.

Pos-boss
- "manter" / "continuar com o mesmo" - mantem o pokemon atual.
- "capturar novo" / "trocar de pokemon" - pega um novo pokemon da regiao.

Reset
- "resetar progresso" / "apagar progresso" / "comecar do zero" - apaga o progresso (pede confirmacao).
- "sim" / "nao" - confirma ou cancela o reset e outras decisoes.

Ajuda e saida
- "ajuda" - explica o que voce pode fazer.
- "parar" / "sair" / "fechar" - encerra a skill.
