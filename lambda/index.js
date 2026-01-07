/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const axios = require('axios');
const AWS = require('aws-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const POKEAPI_LIST_URL = 'https://pokeapi.co/api/v2/pokemon?offset=0&limit=151';
const DEFAULT_LEVEL = 1;
const MAX_GENERATION = 9;
const generationSpeciesCache = new Map();
const GYM_TOTAL_STAGES = 6;
const GYM_BOSS_STAGE = 6;
const GYM_BOSS_HP_MULTIPLIER = 1.25;
const GYM_BOSS_DAMAGE_MULTIPLIER = 1.15;
const BATTLE_MENU_SPEECH = 'Voce pode: atacar, especial, defender, usar item ou fugir. O que voce escolhe?';
const BATTLE_MENU_REPROMPT = 'Atacar, especial, defender, item ou fugir?';
const SHORT_CONFIRM_REPROMPT = 'Quer continuar?';
const SHORT_START_GYM_REPROMPT = 'Quer comecar?';
const SHORT_CAPTURE_REPROMPT = 'Quer capturar?';
const SHORT_RETRY_REPROMPT = 'Quer tentar novamente?';
const SHORT_BATTLE_REPROMPT = 'Atacar ou fugir?';
const SHORT_GENERATION_REPROMPT = 'Diga um numero de geracao.';
const SHORT_HELP_REPROMPT = 'Diga cacar pokemon ou modo batalha.';
const SHORT_CATCH_PROMPT = 'Peca para cacar um Pokemon.';
const SHORT_TRY_AGAIN_REPROMPT = 'Tente de novo.';
const SHORT_YES_NO_PROMPT = 'Sim ou nao?';
const OPTIONS_CAPTURE = 'Diga sim para capturar ou nao para tentar outro.';
const OPTIONS_GYM_CONFIRM = 'Diga sim para comecar ou nao para sair.';
const OPTIONS_POST_BOSS = 'Diga manter ou capturar novo.';
const OPTIONS_CAPTURE_REWARD = 'Diga sim para trocar ou nao para manter.';
const OPTIONS_IDLE_WITH_POKEMON = 'Voce pode dizer modo batalha ou entrar no ginasio.';
const OPTIONS_IDLE_NO_POKEMON = 'Voce pode dizer cacar pokemon.';
const OPTIONS_WILD_BATTLE = 'Voce pode atacar ou fugir.';
const ALLOCATE_POINTS_PROMPT = 'Quer colocar em Vida, Ataque, Especial, Defesa, Defesa especial, Velocidade ou Desvio?';
const ALLOCATE_POINTS_REPROMPT = 'Vida, Ataque, Especial, Defesa, Defesa especial, Velocidade ou Desvio?';
const ALLOCATE_POINTS_CONTINUE_PROMPT = 'Pontos distribuidos. Quer continuar para a proxima batalha?';
const ALLOCATE_POINTS_CONTINUE_REPROMPT = 'Diga sim para continuar ou nao para sair.';
const POST_BOSS_CHOICE_PROMPT = 'Voce quer manter seu Pokemon atual ou capturar um novo da nova regiao?';
const POST_BOSS_CHOICE_REPROMPT = 'Manter ou capturar novo?';
const RESPEC_MENU_PROMPT = 'Voce quer redistribuir seus pontos agora?';
const RESPEC_MENU_REPROMPT = 'Sim ou nao?';
const CAPTURE_REWARD_REPROMPT = 'Quer trocar?';
const SESSION_STATES = {
    IDLE: 'IDLE',
    GYM_CONFIRM_START: 'GYM_CONFIRM_START',
    GYM_IN_RUN: 'GYM_IN_RUN',
    BATTLE_TURN_MENU: 'BATTLE_TURN_MENU',
    ALLOCATE_POINTS: 'ALLOCATE_POINTS',
    POST_BOSS_CHOICE: 'POST_BOSS_CHOICE',
    CAPTURE_NEW_REWARD: 'CAPTURE_NEW_REWARD',
    RESPEC_MENU: 'RESPEC_MENU'
};
const SESSION_STATE_VALUES = new Set(Object.values(SESSION_STATES));

const LoadPersistentAttributesInterceptor = {
    async process(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (sessionAttributes._loaded) {
            return;
        }

        try {
            const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes() || {};
            const normalized = normalizePersistentAttributes(persistentAttributes);
            const merged = {
                ...normalized,
                ...sessionAttributes,
                _loaded: true
            };

            ensureSessionState(merged);
            handlerInput.attributesManager.setSessionAttributes(merged);
        } catch (error) {
            console.log(`Erro ao carregar atributos persistentes: ${error.message}`);
            const merged = {
                ...sessionAttributes,
                _loaded: true
            };
            ensureSessionState(merged);
            handlerInput.attributesManager.setSessionAttributes(merged);
        }
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const activeGymRun = getActiveGymRun(sessionAttributes);
        if (activeGymRun) {
            sessionAttributes.state = SESSION_STATES.GYM_CONFIRM_START;
            sessionAttributes.gymResume = true;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const speakOutput = `Voce tem um ginasio em andamento no estagio ${activeGymRun.stage}. Quer continuar?`;
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
        const capturedPokemon = getCapturedPokemon(sessionAttributes);

        let speakOutput = 'Bem-vindo à cidade de Pallet, treinador! Peça para caçar um Pokémon.';
        if (capturedPokemon) {
            speakOutput = `Bem-vindo de volta! Você já tem ${capturedPokemon.name} como seu Pokémon inicial. Diga "modo batalha" para começar sua jornada.`;
        }

        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const GetSorteioPokemonIntentHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetSorteioPokemonIntent'
        );
    },
    async handle(handlerInput) {
        let safeGenerationId = 1;
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        try {
            const player = getPlayer(sessionAttributes);
            const generationId = Number(player.currentGeneration);
            safeGenerationId = Number.isFinite(generationId) && generationId > 0 ? generationId : 1;
            const capturedPokemon = getCapturedPokemon(sessionAttributes);
            if (capturedPokemon) {
                const speakOutput = `Você já tem ${capturedPokemon.name} como seu Pokémon inicial. Não é possível capturar outro. Diga "modo batalha" para iniciar sua jornada ao lado de ${capturedPokemon.name}.`;
                return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
            }

            const randomPokemon = await getRandomPokemonFromGeneration(safeGenerationId);
            sessionAttributes.encounter = {
                name: randomPokemon.name,
                type: randomPokemon.type,
                rarity: randomPokemon.rarity
            };

            const traducaoTipo = getStatusInicial(sessionAttributes.encounter.type).Traducao;
            const speakOutput = `O Pokémon encontrado foi ${randomPokemon.name}! Ele é do tipo ${traducaoTipo}. A chance de captura é de ${randomPokemon.rarity.chanceDeCaptura}%. Você gostaria de tentar capturar este Pokémon?`;

            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        } catch (err) {
            console.error('Erro ao buscar pokemon da geracao', {
                generationId: typeof safeGenerationId === 'undefined' ? null : safeGenerationId,
                message: err.message,
                stack: err.stack
            });
            const speakOutput = 'Desculpe, nao consegui buscar um Pokemon agora. Tente novamente em instantes.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const CapturePokemonIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'CapturePokemonIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const capturedPokemon = getCapturedPokemon(sessionAttributes);

        if (capturedPokemon) {
            const speakOutput = `Você já capturou ${capturedPokemon.name}. Não é possível capturar outro. Diga "modo batalha" para continuar.`;
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const encounter = sessionAttributes.encounter;
        if (!encounter) {
            return buildResponseWithOptions(
                handlerInput,
                sessionAttributes,
                'Vocˆ ainda nÆo encontrou um Pok‚mon para capturar! Pe‡a para procurar um primeiro.'
            );
        }

        const randomNumber = Math.floor(Math.random() * 101);
        let speakOutput = '';

        if (randomNumber <= encounter.rarity.chanceDeCaptura) {
            const pokemon = buildPokemon(encounter.name, encounter.type, DEFAULT_LEVEL);
            sessionAttributes.pokemon = pokemon;
            delete sessionAttributes.encounter;

            await saveAll(handlerInput, sessionAttributes);

            speakOutput = `Parabens! Voce capturou ${pokemon.name}, com HP de ${pokemon.stats.Vida}. Agora voce pode iniciar sua jornada com seu novo Pokemon! ${OPTIONS_IDLE_WITH_POKEMON}`;
        } else {
            speakOutput = getErroCaptura(encounter.name);
        }

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const TentarNovamenteIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TentarNovamenteIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        try {
            if (getCapturedPokemon(sessionAttributes)) {
                return buildResponseWithOptions(handlerInput, sessionAttributes, 'Você já capturou um Pokémon. Não é possível tentar novamente.');
            }

            return GetSorteioPokemonIntentHandler.handle(handlerInput);
        } catch (err) {
            console.error('Erro ao tentar novamente', err);
            const speakOutput = 'Desculpe, nao consegui tentar novamente agora. Tente de novo em instantes.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const ModoBatalhaIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ModoBatalhaIntent';
    },
    async handle(handlerInput) {
        let safeGenerationId = 1;
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        try {
            const player = getPlayer(sessionAttributes);
            if (sessionAttributes.state === SESSION_STATES.POST_BOSS_CHOICE) {
                return buildPostBossChoiceResponse(handlerInput, sessionAttributes);
            }
            if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
                return buildCaptureRewardDecisionResponse(handlerInput, sessionAttributes);
            }
            if (sessionAttributes.state === SESSION_STATES.RESPEC_MENU) {
                return buildRespecMenuResponse(handlerInput, sessionAttributes);
            }
            const generationId = Number(player.currentGeneration);
            safeGenerationId = Number.isFinite(generationId) && generationId > 0 ? generationId : 1;
            const playerPokemon = getCapturedPokemon(sessionAttributes);
            if (!playerPokemon) {
                const speakOutput = 'Você ainda não tem um Pokémon para batalhar. Tente capturar um primeiro!';
                return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
            }

            const activeGymRun = getActiveGymRun(sessionAttributes);
            if (activeGymRun) {
                if (Number(player.attributePoints) > 0 && !activeGymRun.battle) {
                    return buildAllocatePointsResponse(
                        handlerInput,
                        sessionAttributes,
                        'Voce tem pontos para distribuir.'
                    );
                }

                const { enemy } = ensureBattleState(activeGymRun, playerPokemon);
                sessionAttributes.activeGymRun = activeGymRun;
                await saveAll(handlerInput, sessionAttributes);

                const stageLabel = activeGymRun.stage || 1;
                const enemyLabel = enemy
                    ? (enemy.isBoss ? `o Lider ${enemy.name}` : `o treinador ${enemy.name}`)
                    : 'o proximo adversario';
                return buildBattleMenuResponse(
                    handlerInput,
                    sessionAttributes,
                    `Estagio ${stageLabel}. Seu adversario e ${enemyLabel}.`
                );
            }

            const pokemonInimigoBase = await getRandomPokemonFromGeneration(safeGenerationId);
            const pokemonInimigo = buildPokemon(
                pokemonInimigoBase.name,
                pokemonInimigoBase.type,
                playerPokemon.level || DEFAULT_LEVEL
            );

            sessionAttributes.battle = { enemy: pokemonInimigo };
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const speakOutput = `Um ${pokemonInimigo.name} selvagem apareceu! Ele esta no nivel ${pokemonInimigo.level}. Prepare-se para a batalha! ${OPTIONS_WILD_BATTLE}`;

            return buildResponseWithOptions(
                handlerInput,
                sessionAttributes,
                speakOutput,
                { text: OPTIONS_WILD_BATTLE, reprompt: SHORT_BATTLE_REPROMPT }
            );
        } catch (err) {
            console.error('Erro ao buscar pokemon da geracao para batalha', {
                generationId: typeof safeGenerationId === 'undefined' ? null : safeGenerationId,
                message: err.message,
                stack: err.stack
            });
            const speakOutput = 'Desculpe, nao consegui iniciar a batalha agora. Tente novamente em instantes.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const EnterGymIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'EnterGymIntent' || intentName === 'GinasioIntent');
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const playerPokemon = getCapturedPokemon(sessionAttributes);
        if (!playerPokemon) {
            const speakOutput = 'Voce precisa capturar um Pokemon primeiro. Peca para cacar um.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const activeGymRun = getActiveGymRun(sessionAttributes);
        if (activeGymRun) {
            sessionAttributes.state = SESSION_STATES.GYM_CONFIRM_START;
            sessionAttributes.gymResume = true;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const speakOutput = `Voce tem um ginasio em andamento no estagio ${activeGymRun.stage}. Quer continuar?`;
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        sessionAttributes.state = SESSION_STATES.GYM_CONFIRM_START;
        sessionAttributes.gymResume = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const speakOutput = 'Voce vai enfrentar 5 treinadores e depois o Lider. Quer comecar?';
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const YesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (sessionAttributes.state === SESSION_STATES.RESPEC_MENU) {
            return handleRespecDecision(handlerInput, sessionAttributes, true);
        }
        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return acceptRewardPokemon(handlerInput, sessionAttributes);
        }
        if (sessionAttributes.state === SESSION_STATES.POST_BOSS_CHOICE) {
            return buildPostBossChoiceResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }
        if (sessionAttributes.state === SESSION_STATES.ALLOCATE_POINTS) {
            const player = getPlayer(sessionAttributes);
            if (Number(player.attributePoints) > 0) {
                return buildAllocatePointsResponse(
                    handlerInput,
                    sessionAttributes,
                    'Voce ainda tem pontos para distribuir.'
                );
            }

            const activeGymRun = getActiveGymRun(sessionAttributes);
            if (activeGymRun) {
                return startNextGymBattle(handlerInput, sessionAttributes, 'Vamos continuar.');
            }

            sessionAttributes.state = SESSION_STATES.IDLE;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            const speakOutput = 'Tudo certo.';
            await saveAll(handlerInput, sessionAttributes);
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        if (sessionAttributes.state !== SESSION_STATES.GYM_CONFIRM_START) {
            const speakOutput = 'Beleza.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const playerPokemon = getCapturedPokemon(sessionAttributes);
        if (!playerPokemon) {
            sessionAttributes.state = SESSION_STATES.IDLE;
            sessionAttributes.gymResume = false;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const speakOutput = 'Voce precisa capturar um Pokemon primeiro. Peca para cacar um.';
            await saveAll(handlerInput, sessionAttributes);
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        try {
            const player = getPlayer(sessionAttributes);
            let activeGymRun = getActiveGymRun(sessionAttributes);

            if (activeGymRun && Number(player.attributePoints) > 0 && !activeGymRun.battle) {
                sessionAttributes.state = SESSION_STATES.ALLOCATE_POINTS;
                sessionAttributes.gymResume = false;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                await saveAll(handlerInput, sessionAttributes);
                return buildAllocatePointsResponse(
                    handlerInput,
                    sessionAttributes,
                    'Voce tem pontos para distribuir antes de continuar.'
                );
            }

            if (!sessionAttributes.gymResume || !activeGymRun) {
                activeGymRun = await createGymRun(player, playerPokemon);
                sessionAttributes.activeGymRun = activeGymRun;
            } else if (!activeGymRun.battle) {
                const enemy = getGymEnemyByStage(activeGymRun);
                if (enemy) {
                    activeGymRun.battle = createGymBattleState(playerPokemon, enemy);
                    sessionAttributes.activeGymRun = activeGymRun;
                }
            }

            sessionAttributes.state = SESSION_STATES.BATTLE_TURN_MENU;
            sessionAttributes.gymResume = false;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            await saveAll(handlerInput, sessionAttributes);

            const currentRun = getActiveGymRun(sessionAttributes);
            const enemy = getGymEnemyByStage(currentRun);
            const stageLabel = currentRun ? currentRun.stage : 1;
            const enemyLabel = enemy
                ? (enemy.isBoss ? `o Lider ${enemy.name}` : `o treinador ${enemy.name}`)
                : 'o proximo adversario';
            return buildBattleMenuResponse(
                handlerInput,
                sessionAttributes,
                `Estagio ${stageLabel}. Seu adversario e ${enemyLabel}.`
            );
        } catch (err) {
            console.error('Erro ao iniciar ginasio', {
                message: err.message,
                stack: err.stack
            });
            const speakOutput = 'Desculpe, nao consegui iniciar o ginasio agora. Tente novamente em instantes.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const NoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (sessionAttributes.state === SESSION_STATES.RESPEC_MENU) {
            return handleRespecDecision(handlerInput, sessionAttributes, false);
        }
        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return finalizeBossChoice(handlerInput, sessionAttributes, 'Tudo bem, voce manteve seu Pokemon atual.');
        }
        if (sessionAttributes.state === SESSION_STATES.POST_BOSS_CHOICE) {
            return buildPostBossChoiceResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }
        if (sessionAttributes.state === SESSION_STATES.ALLOCATE_POINTS) {
            const player = getPlayer(sessionAttributes);
            if (Number(player.attributePoints) > 0) {
                return buildAllocatePointsResponse(
                    handlerInput,
                    sessionAttributes,
                    'Voce ainda tem pontos para distribuir.'
                );
            }

            sessionAttributes.state = SESSION_STATES.IDLE;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const activeGymRun = getActiveGymRun(sessionAttributes);
            const speakOutput = activeGymRun
                ? 'Tudo bem. Quando quiser continuar, diga "modo batalha".'
                : 'Ok.';
            await saveAll(handlerInput, sessionAttributes);
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        if (sessionAttributes.state === SESSION_STATES.GYM_CONFIRM_START) {
            sessionAttributes.state = SESSION_STATES.IDLE;
            sessionAttributes.gymResume = false;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const speakOutput = 'Tudo bem. Quando quiser, diga "entrar no ginasio".';
            await saveAll(handlerInput, sessionAttributes);
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const speakOutput = 'Ok.';
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const GymAttackIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'GymAttackIntent' || intentName === 'AtacarIntent');
    },
    async handle(handlerInput) {
        return handleGymBattleAction(handlerInput, 'fast');
    }
};

const GymSpecialIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'GymSpecialIntent' || intentName === 'EspecialIntent');
    },
    async handle(handlerInput) {
        return handleGymBattleAction(handlerInput, 'special');
    }
};

const GymDefendIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'GymDefendIntent' || intentName === 'DefenderIntent');
    },
    async handle(handlerInput) {
        return handleGymBattleAction(handlerInput, 'defend');
    }
};

const GymItemIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'GymItemIntent' || intentName === 'UsarItemIntent');
    },
    async handle(handlerInput) {
        const itemSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'item');
        return handleGymBattleAction(handlerInput, 'item', itemSlot);
    }
};

const GymFleeIntentHandler = {
    canHandle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (intentName === 'GymFleeIntent' || intentName === 'FugirIntent');
    },
    async handle(handlerInput) {
        return handleGymBattleAction(handlerInput, 'flee');
    }
};

const StatusIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StatusIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const playerPokemon = getCapturedPokemon(sessionAttributes);
        if (!playerPokemon) {
            const speakOutput = 'Voce ainda nao tem um Pokemon capturado.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const activeGymRun = getActiveGymRun(sessionAttributes);
        if (activeGymRun && activeGymRun.battle) {
            const { battle, enemy } = ensureBattleState(activeGymRun, playerPokemon);
            playerPokemon.hpCurrent = battle.playerHpCurrent;
            if (enemy) {
                enemy.hpCurrent = battle.enemyHpCurrent;
            }
            const speakOutput = renderBattleStatus(playerPokemon, enemy);

            if (sessionAttributes.state === SESSION_STATES.BATTLE_TURN_MENU) {
                return buildBattleMenuResponse(handlerInput, sessionAttributes, speakOutput);
            }

            return buildResponseWithOptions(
                handlerInput,
                sessionAttributes,
                speakOutput,
                { text: BATTLE_MENU_SPEECH, reprompt: BATTLE_MENU_REPROMPT }
            );
        }

        const playerMaxHp = getPlayerMaxHp(playerPokemon);
        const currentHp = Number.isFinite(Number(playerPokemon.hpCurrent))
            ? Number(playerPokemon.hpCurrent)
            : playerMaxHp;
        const speakOutput = `Seu Pokemon esta com ${currentHp} de ${playerMaxHp} de vida. Nao ha batalha ativa agora.`;
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const KeepPokemonIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'KeepPokemonIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return finalizeBossChoice(handlerInput, sessionAttributes, 'Tudo bem, voce manteve seu Pokemon atual.');
        }

        if (sessionAttributes.state !== SESSION_STATES.POST_BOSS_CHOICE) {
            const speakOutput = 'Ok.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        return finalizeBossChoice(handlerInput, sessionAttributes, 'Beleza. Voce manteve seu Pokemon atual.');
    }
};

const CaptureNewPokemonIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CaptureNewPokemonIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return acceptRewardPokemon(handlerInput, sessionAttributes);
        }

        if (sessionAttributes.state !== SESSION_STATES.POST_BOSS_CHOICE) {
            const speakOutput = 'Ok.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const player = getPlayer(sessionAttributes);
        const generationValue = Number(player.currentGeneration);
        const generationId = Number.isFinite(generationValue) && generationValue > 0
            ? Math.min(MAX_GENERATION, generationValue)
            : 1;
        try {
            const reward = await getRandomPokemonFromGeneration(generationId);
            sessionAttributes.rewardPokemon = reward;
            sessionAttributes.state = SESSION_STATES.CAPTURE_NEW_REWARD;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            const traducaoTipo = getStatusInicial(reward.type).Traducao;
            const speakOutput = `Como recompensa, o novo Pokemon e ${reward.name} do tipo ${traducaoTipo}. Quer trocar pelo seu atual?`;
            return buildResponseWithOptions(
                handlerInput,
                sessionAttributes,
                speakOutput,
                { text: OPTIONS_CAPTURE_REWARD, reprompt: SHORT_YES_NO_PROMPT }
            );
        } catch (err) {
            console.error('Erro ao sortear Pokemon de recompensa', {
                generationId,
                message: err.message,
                stack: err.stack
            });
            const speakOutput = 'Desculpe, nao consegui sortear o novo Pokemon agora. Tente novamente.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const AllocatePointsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AllocatePointsIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const player = getPlayer(sessionAttributes);
        const playerPokemon = getCapturedPokemon(sessionAttributes);
        if (!playerPokemon) {
            const speakOutput = 'Voce precisa capturar um Pokemon primeiro.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const availablePoints = Number(player.attributePoints) || 0;
        if (availablePoints <= 0) {
            sessionAttributes.state = SESSION_STATES.IDLE;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            const speakOutput = 'Voce nao tem pontos para distribuir.';
            await saveAll(handlerInput, sessionAttributes);
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        const attributeSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'attribute');
        const attributeKey = normalizeAttributeName(attributeSlot);
        if (!attributeKey) {
            return buildAllocatePointsResponse(handlerInput, sessionAttributes, 'Nao entendi o atributo.');
        }

        applyAttributePoint(playerPokemon, player, attributeKey);
        setPlayer(sessionAttributes, player);
        sessionAttributes.pokemon = playerPokemon;

        const remainingPoints = Number(player.attributePoints) || 0;
        const attributeLabel = formatAttributeLabel(attributeKey);
        const activeGymRun = getActiveGymRun(sessionAttributes);

        if (remainingPoints > 0) {
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            await saveAll(handlerInput, sessionAttributes);
            return buildAllocatePointsResponse(
                handlerInput,
                sessionAttributes,
                `Ponto aplicado em ${attributeLabel}. Restam ${remainingPoints} pontos.`
            );
        }

        if (activeGymRun && activeGymRun.inProgress) {
            const enemy = getGymEnemyByStage(activeGymRun);
            if (enemy && !activeGymRun.battle) {
                activeGymRun.battle = createGymBattleState(playerPokemon, enemy, playerPokemon.hpCurrent);
            }
            sessionAttributes.activeGymRun = activeGymRun;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            await saveAll(handlerInput, sessionAttributes);

            return buildContinueAfterAllocationResponse(
                handlerInput,
                sessionAttributes,
                `Ponto aplicado em ${attributeLabel}.`
            );
        }

        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);

        const speakOutput = `Ponto aplicado em ${attributeLabel}. Pontos distribuidos.`;
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const SetGenerationIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetGenerationIntent';
    },
    async handle(handlerInput) {
        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            const slotValue = Alexa.getSlotValue(handlerInput.requestEnvelope, 'generation');
            const generationId = parseGenerationId(slotValue);

            if (!generationId) {
                const speakOutput = `Qual geracao voce quer usar? Diga um numero entre 1 e ${MAX_GENERATION}.`;
                return buildResponseWithOptions(
                    handlerInput,
                    sessionAttributes,
                    speakOutput,
                    { text: SHORT_GENERATION_REPROMPT, reprompt: SHORT_GENERATION_REPROMPT }
                );
            }

            if (generationId < 1 || generationId > MAX_GENERATION) {
                const speakOutput = `A geracao precisa estar entre 1 e ${MAX_GENERATION}.`;
                return buildResponseWithOptions(
                    handlerInput,
                    sessionAttributes,
                    speakOutput,
                    { text: SHORT_GENERATION_REPROMPT, reprompt: SHORT_GENERATION_REPROMPT }
                );
            }

            const player = getPlayer(sessionAttributes);
            player.currentGeneration = generationId;
            setPlayer(sessionAttributes, player);
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            await saveAll(handlerInput, sessionAttributes);

            const speakOutput = `Pronto! Agora vou usar a geracao ${generationId}. Peca para cacar um Pokemon.`;
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        } catch (err) {
            console.error('Erro ao atualizar geracao do jogador', {
                message: err.message,
                stack: err.stack
            });
            const speakOutput = 'Desculpe, nao consegui atualizar a geracao agora. Tente novamente em instantes.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (sessionAttributes.state === SESSION_STATES.BATTLE_TURN_MENU) {
            return buildBattleMenuResponse(handlerInput, sessionAttributes);
        }
        if (sessionAttributes.state === SESSION_STATES.ALLOCATE_POINTS) {
            const player = getPlayer(sessionAttributes);
            if (Number(player.attributePoints) > 0) {
                return buildAllocatePointsResponse(handlerInput, sessionAttributes);
            }
            const activeGymRun = getActiveGymRun(sessionAttributes);
            if (activeGymRun && activeGymRun.inProgress) {
                return buildContinueAfterAllocationResponse(handlerInput, sessionAttributes);
            }
        }
        if (sessionAttributes.state === SESSION_STATES.POST_BOSS_CHOICE) {
            return buildPostBossChoiceResponse(handlerInput, sessionAttributes);
        }
        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return buildCaptureRewardDecisionResponse(handlerInput, sessionAttributes);
        }
        if (sessionAttributes.state === SESSION_STATES.RESPEC_MENU) {
            return buildRespecMenuResponse(handlerInput, sessionAttributes);
        }

        const speakOutput = 'Voce pode pedir para eu procurar um Pokemon, entrar no ginasio ou dizer "modo batalha".';

        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput, SHORT_HELP_REPROMPT, SHORT_HELP_REPROMPT);
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const speakOutput = 'Adeus, treinador!';
        return buildResponseWithOptions(
            handlerInput,
            sessionAttributes,
            speakOutput,
            'Quando quiser voltar, diga abrir modo pokemon.',
            null,
            true
        );
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (sessionAttributes.state === SESSION_STATES.BATTLE_TURN_MENU) {
            return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }
        if (sessionAttributes.state === SESSION_STATES.ALLOCATE_POINTS) {
            const player = getPlayer(sessionAttributes);
            if (Number(player.attributePoints) > 0) {
                return buildAllocatePointsResponse(handlerInput, sessionAttributes, 'Nao entendi.');
            }
            const activeGymRun = getActiveGymRun(sessionAttributes);
            if (activeGymRun && activeGymRun.inProgress) {
                return buildContinueAfterAllocationResponse(handlerInput, sessionAttributes, 'Nao entendi.');
            }
        }
        if (sessionAttributes.state === SESSION_STATES.POST_BOSS_CHOICE) {
            return buildPostBossChoiceResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }
        if (sessionAttributes.state === SESSION_STATES.CAPTURE_NEW_REWARD) {
            return buildCaptureRewardDecisionResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }
        if (sessionAttributes.state === SESSION_STATES.RESPEC_MENU) {
            return buildRespecMenuResponse(handlerInput, sessionAttributes, 'Nao entendi.');
        }

        const speakOutput = 'Nao entendi o que voce disse. Tente novamente.';

        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Sessão encerrada: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `Você acionou ${intentName}`;

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Desculpe, tive problemas para fazer o que você pediu. Por favor, tente novamente.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }
};

function parseGenerationId(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return Math.floor(parsed);
}

async function getPokemonRarity(pokemonName) {
    const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${pokemonName}/`;
    const response = await axios.get(speciesUrl);
    const data = response.data;
    const captureRate = data.capture_rate;
    const chanceDeCaptura = Math.round((captureRate / 255) * 100);

    return {
        nome: pokemonName,
        chanceDeCaptura,
        mitico: data.is_mythical,
        lendario: data.is_legendary
    };
}

async function getGenerationSpeciesNames(generationId) {
    const cacheKey = String(generationId);
    if (generationSpeciesCache.has(cacheKey)) {
        return generationSpeciesCache.get(cacheKey);
    }

    const response = await axios.get(`https://pokeapi.co/api/v2/generation/${generationId}/`);
    const speciesList = (response.data && response.data.pokemon_species) || [];
    const names = speciesList
        .map((entry) => entry && entry.name)
        .filter(Boolean);

    if (names.length === 0) {
        throw new Error(`Nenhuma especie encontrada para geracao ${generationId}`);
    }

    generationSpeciesCache.set(cacheKey, names);
    return names;
}

async function getRandomPokemonFromGeneration(generationId) {
    const speciesNames = await getGenerationSpeciesNames(generationId);
    const randomIndex = Math.floor(Math.random() * speciesNames.length);
    const pokemonName = speciesNames[randomIndex];
    const pokemonResponse = await axios.get(`https://pokeapi.co/api/v2/pokemon/${pokemonName}/`);
    const pokemonData = pokemonResponse.data;
    const types = pokemonData.types.map((typeInfo) => typeInfo.type.name);
    const rarity = await getPokemonRarity(pokemonName);

    return {
        name: pokemonName,
        types,
        type: types[0],
        rarity,
        imageUrl: pokemonData.sprites.front_default
    };
}

function getErroCaptura(pokemonName) {
    const pokemonEscapou = [
        'escapou devido à densa vegetação da floresta, que dificultou a captura. Os arbustos e árvores permitiram que o Pokémon se escondesse.',
        'conseguiu escapar na caverna escura, onde sua agilidade e capacidade de se movimentar em ambientes sombrios o ajudaram a se esquivar de você.',
        'correu na direção de um penhasco, e você não conseguiu alcançá-lo a tempo antes que ele pulasse para um local inacessível.',
        'escapou. Enquanto você tentava capturar, outro Pokémon selvagem apareceu e distraiu você.',
        'escapou, você não conseguiu reagir a tempo pois estava distraído olhando em outra direção.',
        'fugiu assustado porque um Pokémon selvagem mais forte apareceu e atacou o alvo.',
        'é particularmente ágil e conseguiu se esquivar de você de maneira surpreendentemente rápida.',
        'percebeu que estava em desvantagem e fugiu para preservar sua própria segurança.',
        'escapou sem ser visto. Mudanças repentinas no clima afetaram sua visibilidade e mobilidade.',
        'caiu em uma armadilha natural, como uma rede de teia de um Pokémon Bug, permitindo-lhe escapar de você.'
    ];
    const randomIndex = Math.floor(Math.random() * pokemonEscapou.length);
    return `${pokemonName} ${pokemonEscapou[randomIndex]} Peça para eu tentar novamente para caçar outro Pokémon.`;
}

const STATUS_BASE = {
    normal: {
        Vida: 100,
        DanoDeAtaque: 20,
        AtaqueEspecial: 15,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 10,
        Velocidade: 20,
        Traducao: 'Normal'
    },
    fire: {
        Vida: 90,
        DanoDeAtaque: 25,
        AtaqueEspecial: 30,
        DefesaDeAtaque: 15,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 15,
        Velocidade: 25,
        Traducao: 'Fogo'
    },
    water: {
        Vida: 95,
        DanoDeAtaque: 20,
        AtaqueEspecial: 25,
        DefesaDeAtaque: 25,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 12,
        Velocidade: 18,
        Traducao: 'Água'
    },
    electric: {
        Vida: 85,
        DanoDeAtaque: 20,
        AtaqueEspecial: 35,
        DefesaDeAtaque: 15,
        DefesaDeAtaqueEspecial: 15,
        ChanceDeDesvio: 20,
        Velocidade: 30,
        Traducao: 'Elétrico'
    },
    grass: {
        Vida: 100,
        DanoDeAtaque: 15,
        AtaqueEspecial: 20,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 25,
        ChanceDeDesvio: 10,
        Velocidade: 15,
        Traducao: 'Grama'
    },
    ice: {
        Vida: 90,
        DanoDeAtaque: 25,
        AtaqueEspecial: 30,
        DefesaDeAtaque: 15,
        DefesaDeAtaqueEspecial: 15,
        ChanceDeDesvio: 15,
        Velocidade: 20,
        Traducao: 'Gelo'
    },
    fighting: {
        Vida: 95,
        DanoDeAtaque: 30,
        AtaqueEspecial: 15,
        DefesaDeAtaque: 25,
        DefesaDeAtaqueEspecial: 10,
        ChanceDeDesvio: 10,
        Velocidade: 20,
        Traducao: 'Lutador'
    },
    poison: {
        Vida: 85,
        DanoDeAtaque: 20,
        AtaqueEspecial: 25,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 25,
        ChanceDeDesvio: 20,
        Velocidade: 15,
        Traducao: 'Venenoso'
    },
    ground: {
        Vida: 100,
        DanoDeAtaque: 25,
        AtaqueEspecial: 20,
        DefesaDeAtaque: 30,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 5,
        Velocidade: 10,
        Traducao: 'Terrestre'
    },
    flying: {
        Vida: 85,
        DanoDeAtaque: 20,
        AtaqueEspecial: 30,
        DefesaDeAtaque: 15,
        DefesaDeAtaqueEspecial: 15,
        ChanceDeDesvio: 25,
        Velocidade: 25,
        Traducao: 'Voador'
    },
    psychic: {
        Vida: 80,
        DanoDeAtaque: 15,
        AtaqueEspecial: 40,
        DefesaDeAtaque: 15,
        DefesaDeAtaqueEspecial: 30,
        ChanceDeDesvio: 20,
        Velocidade: 20,
        Traducao: 'Psíquico'
    },
    bug: {
        Vida: 90,
        DanoDeAtaque: 20,
        AtaqueEspecial: 15,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 15,
        Velocidade: 25,
        Traducao: 'Inseto'
    },
    rock: {
        Vida: 95,
        DanoDeAtaque: 30,
        AtaqueEspecial: 10,
        DefesaDeAtaque: 35,
        DefesaDeAtaqueEspecial: 30,
        ChanceDeDesvio: 5,
        Velocidade: 10,
        Traducao: 'Pedra'
    },
    ghost: {
        Vida: 85,
        DanoDeAtaque: 20,
        AtaqueEspecial: 35,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 25,
        ChanceDeDesvio: 30,
        Velocidade: 20,
        Traducao: 'Fantasma'
    },
    dragon: {
        Vida: 100,
        DanoDeAtaque: 30,
        AtaqueEspecial: 30,
        DefesaDeAtaque: 25,
        DefesaDeAtaqueEspecial: 25,
        ChanceDeDesvio: 10,
        Velocidade: 20,
        Traducao: 'Dragão'
    },
    dark: {
        Vida: 90,
        DanoDeAtaque: 25,
        AtaqueEspecial: 20,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 20,
        ChanceDeDesvio: 20,
        Velocidade: 25,
        Traducao: 'Noturno'
    },
    steel: {
        Vida: 105,
        DanoDeAtaque: 25,
        AtaqueEspecial: 15,
        DefesaDeAtaque: 35,
        DefesaDeAtaqueEspecial: 30,
        ChanceDeDesvio: 5,
        Velocidade: 10,
        Traducao: 'Metal'
    },
    fairy: {
        Vida: 95,
        DanoDeAtaque: 15,
        AtaqueEspecial: 35,
        DefesaDeAtaque: 20,
        DefesaDeAtaqueEspecial: 30,
        ChanceDeDesvio: 15,
        Velocidade: 18,
        Traducao: 'Fada'
    }
};

const STATUS_FALLBACK = {
    Vida: 90,
    DanoDeAtaque: 20,
    AtaqueEspecial: 15,
    DefesaDeAtaque: 20,
    DefesaDeAtaqueEspecial: 20,
    ChanceDeDesvio: 10,
    Velocidade: 20,
    Traducao: 'Desconhecido'
};

function getStatusInicial(type) {
    const base = STATUS_BASE[type] || STATUS_FALLBACK;
    return {
        Vida: base.Vida,
        DanoDeAtaque: base.DanoDeAtaque,
        AtaqueEspecial: base.AtaqueEspecial,
        DefesaDeAtaque: base.DefesaDeAtaque,
        DefesaDeAtaqueEspecial: base.DefesaDeAtaqueEspecial,
        ChanceDeDesvio: base.ChanceDeDesvio,
        Velocidade: base.Velocidade,
        Traducao: base.Traducao
    };
}

async function getRandomPokemon(level = DEFAULT_LEVEL) {
    try {
        const response = await axios.get(POKEAPI_LIST_URL);
        const pokemons = response.data.results;
        const randomPokemonIndex = Math.floor(Math.random() * pokemons.length);
        const randomPokemon = pokemons[randomPokemonIndex];
        const pokemonResponse = await axios.get(randomPokemon.url);
        const pokemonData = pokemonResponse.data;
        const types = pokemonData.types.map((typeInfo) => typeInfo.type.name);

        return {
            name: pokemonData.name,
            types,
            type: types[0],
            imageUrl: pokemonData.sprites.front_default,
            rarity: await getPokemonRarity(pokemonData.name),
            level
        };
    } catch (error) {
        console.error('Erro ao buscar Pokémon aleatório:', error);
        throw error;
    }
}

function buildPokemon(name, type, level = DEFAULT_LEVEL) {
    const normalizedType = normalizeType(type);
    const stats = getStatusInicial(normalizedType);
    const pokemon = {
        name,
        type: normalizedType,
        level: DEFAULT_LEVEL,
        stats
    };

    for (let i = DEFAULT_LEVEL; i < level; i++) {
        levelUpPokemon(pokemon);
        pokemon.level += 1;
    }

    return pokemon;
}

function levelUpPokemon(pokemon) {
    const stats = pokemon.stats;
    let vidaIncremento = 10;
    let danoDeAtaqueIncremento = 5;
    let ataqueEspecialIncremento = 5;
    let defesaDeAtaqueIncremento = 3;
    let defesaDeAtaqueEspecialIncremento = 3;
    let chanceDeDesvioIncremento = 2;
    let velocidadeIncremento = 2;

    switch (pokemon.type) {
        case 'normal':
            velocidadeIncremento = 3;
            break;
        case 'fire':
            ataqueEspecialIncremento = 7;
            break;
        case 'water':
            ataqueEspecialIncremento = 7;
            break;
        case 'grass':
            defesaDeAtaqueEspecialIncremento = 5;
            break;
        case 'ice':
            ataqueEspecialIncremento = 7;
            break;
        case 'fighting':
            defesaDeAtaqueIncremento = 5;
            break;
        case 'poison':
            defesaDeAtaqueEspecialIncremento = 5;
            break;
        case 'ground':
            defesaDeAtaqueIncremento = 5;
            break;
        case 'flying':
            velocidadeIncremento = 3;
            break;
        case 'psychic':
            ataqueEspecialIncremento = 7;
            break;
        case 'bug':
            ataqueEspecialIncremento = 7;
            break;
        case 'rock':
            vidaIncremento = 15;
            break;
        case 'ghost':
            chanceDeDesvioIncremento = 4;
            break;
        case 'dragon':
            ataqueEspecialIncremento = 7;
            break;
        case 'dark':
            danoDeAtaqueIncremento = 7;
            break;
        case 'electric':
            velocidadeIncremento = 3;
            break;
        case 'steel':
            defesaDeAtaqueIncremento = 5;
            break;
        case 'fairy':
            defesaDeAtaqueEspecialIncremento = 5;
            break;
    }

    stats.Vida += Math.floor(Math.random() * (vidaIncremento + 1));
    stats.DanoDeAtaque += Math.floor(Math.random() * (danoDeAtaqueIncremento + 1));
    stats.AtaqueEspecial += Math.floor(Math.random() * (ataqueEspecialIncremento + 1));
    stats.DefesaDeAtaque += Math.floor(Math.random() * (defesaDeAtaqueIncremento + 1));
    stats.DefesaDeAtaqueEspecial += Math.floor(Math.random() * (defesaDeAtaqueEspecialIncremento + 1));
    stats.ChanceDeDesvio += Math.floor(Math.random() * (chanceDeDesvioIncremento + 1));
    stats.Velocidade += Math.floor(Math.random() * (velocidadeIncremento + 1));
}

function getGymEnemyLevel(baseLevel, stage, isBoss) {
    const stageBonus = Math.max(0, stage - 1);
    const bossBonus = isBoss ? 2 : 0;
    return Math.max(1, baseLevel + stageBonus + bossBonus);
}

function applyBossMultipliers(stats) {
    return {
        ...stats,
        Vida: Math.ceil(stats.Vida * GYM_BOSS_HP_MULTIPLIER),
        DanoDeAtaque: Math.ceil(stats.DanoDeAtaque * GYM_BOSS_DAMAGE_MULTIPLIER),
        AtaqueEspecial: Math.ceil(stats.AtaqueEspecial * GYM_BOSS_DAMAGE_MULTIPLIER)
    };
}

function createGymEnemy(randomPokemon, level, isBoss) {
    const basePokemon = buildPokemon(randomPokemon.name, randomPokemon.type, level);
    const baseStats = { ...basePokemon.stats };
    const stats = isBoss ? applyBossMultipliers(baseStats) : baseStats;
    const maxHp = stats.Vida;

    return {
        name: basePokemon.name,
        type: basePokemon.type,
        level: basePokemon.level,
        isBoss: Boolean(isBoss),
        maxHp,
        hpCurrent: maxHp,
        stats
    };
}

function createGymBattleState(playerPokemon, enemy, playerHpOverride) {
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const existingPlayerHp = playerPokemon && Number(playerPokemon.hpCurrent);
    const playerHpCurrent = clampNumber(
        Number.isFinite(playerHpOverride) ? playerHpOverride : (Number.isFinite(existingPlayerHp) ? existingPlayerHp : playerMaxHp),
        0,
        playerMaxHp
    );
    const enemyHpCurrent = enemy ? (Number(enemy.hpCurrent) || enemy.maxHp || 0) : 0;

    return {
        turn: 1,
        playerHpCurrent,
        enemyHpCurrent,
        energy: 0,
        enemyEnergy: 0,
        specialCooldown: 0,
        enemySpecialCooldown: 0,
        defending: false,
        statuses: []
    };
}

async function createGymRun(player, playerPokemon) {
    const generationId = Number(player.currentGeneration);
    const safeGenerationId = Number.isFinite(generationId) && generationId > 0 ? generationId : 1;
    const baseLevel = playerPokemon && playerPokemon.level ? playerPokemon.level : DEFAULT_LEVEL;
    const enemies = [];

    for (let stage = 1; stage <= GYM_TOTAL_STAGES; stage += 1) {
        const isBoss = stage === GYM_BOSS_STAGE;
        const enemyLevel = getGymEnemyLevel(baseLevel, stage, isBoss);
        const randomPokemon = await getRandomPokemonFromGeneration(safeGenerationId);
        const enemy = createGymEnemy(randomPokemon, enemyLevel, isBoss);
        enemies.push(enemy);
    }

    const battle = createGymBattleState(playerPokemon, enemies[0]);

    return {
        inProgress: true,
        generation: safeGenerationId,
        stage: 1,
        enemies,
        battle
    };
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getPlayerMaxHp(playerPokemon) {
    if (!playerPokemon || !playerPokemon.stats) {
        return 0;
    }

    return Number(playerPokemon.stats.Vida) || 0;
}

function getEnemyMaxHp(enemy) {
    if (!enemy) {
        return 0;
    }

    return Number(enemy.maxHp || (enemy.stats && enemy.stats.Vida)) || 0;
}

function renderBattleStatus(playerPokemon, enemy) {
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const enemyMaxHp = getEnemyMaxHp(enemy);
    const playerHp = clampNumber(
        Number(playerPokemon && playerPokemon.hpCurrent) || playerMaxHp,
        0,
        playerMaxHp
    );
    const enemyHp = clampNumber(
        Number(enemy && enemy.hpCurrent) || enemyMaxHp,
        0,
        enemyMaxHp
    );

    return `Seu HP: ${playerHp}/${playerMaxHp}. Inimigo HP: ${enemyHp}/${enemyMaxHp}.`;
}

function getXpToNext(level) {
    const safeLevel = Math.max(1, Number(level) || DEFAULT_LEVEL);
    return 50 + (safeLevel - 1) * 25;
}

function applyXpAndLevel(player, playerPokemon, xpGained) {
    if (!player || !playerPokemon) {
        return { levelsGained: 0, pointsGained: 0, newLevel: DEFAULT_LEVEL };
    }

    const gained = Math.max(0, Number(xpGained) || 0);
    let xp = Number(player.xp) || 0;
    let level = Math.max(1, Number(playerPokemon.level) || DEFAULT_LEVEL);
    let xpToNext = getXpToNext(level);
    let levelsGained = 0;

    xp += gained;

    while (xp >= xpToNext) {
        xp -= xpToNext;
        level += 1;
        levelsGained += 1;
        xpToNext = getXpToNext(level);
    }

    const pointsGained = levelsGained * 2;
    if (levelsGained > 0) {
        player.attributePoints = (Number(player.attributePoints) || 0) + pointsGained;
    }

    player.xp = xp;
    player.xpToNext = xpToNext;
    playerPokemon.level = level;

    return { levelsGained, pointsGained, newLevel: level };
}

function applyBetweenFightHealing(playerPokemon, stageValue) {
    if (!playerPokemon) {
        return { healAmount: 0, newHp: 0, maxHp: 0 };
    }

    const maxHp = getPlayerMaxHp(playerPokemon);
    if (maxHp <= 0) {
        return { healAmount: 0, newHp: 0, maxHp };
    }

    const currentHp = Number.isFinite(Number(playerPokemon.hpCurrent))
        ? Number(playerPokemon.hpCurrent)
        : maxHp;

    let healAmount = 0;
    if (stageValue < GYM_BOSS_STAGE) {
        healAmount += Math.ceil(maxHp * 0.25);
        if (stageValue + 1 === GYM_BOSS_STAGE) {
            healAmount += Math.ceil(maxHp * 0.4);
        }
    }

    const newHp = clampNumber(currentHp + healAmount, 0, maxHp);
    playerPokemon.hpCurrent = newHp;

    return { healAmount, newHp, maxHp };
}

function normalizeAttributeName(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const raw = value.trim().toLowerCase();
    if (!raw) {
        return null;
    }

    if (raw.includes('defesa especial') || raw.includes('defesa de ataque especial') || raw.includes('defesa magica')) {
        return 'DefesaDeAtaqueEspecial';
    }
    if (raw.includes('defesa')) {
        return 'DefesaDeAtaque';
    }
    if (raw.includes('desvio') || raw.includes('evasao')) {
        return 'ChanceDeDesvio';
    }
    if (raw.includes('veloc')) {
        return 'Velocidade';
    }
    if (raw.includes('vida') || raw.includes('hp') || raw.includes('saude')) {
        return 'Vida';
    }
    if (raw.includes('especial')) {
        return 'AtaqueEspecial';
    }
    if (raw.includes('ataque') || raw.includes('dano')) {
        return 'DanoDeAtaque';
    }

    return null;
}

function formatAttributeLabel(attributeKey) {
    switch (attributeKey) {
        case 'Vida':
            return 'Vida';
        case 'DanoDeAtaque':
            return 'Ataque';
        case 'AtaqueEspecial':
            return 'Especial';
        case 'DefesaDeAtaque':
            return 'Defesa';
        case 'DefesaDeAtaqueEspecial':
            return 'Defesa especial';
        case 'Velocidade':
            return 'Velocidade';
        case 'ChanceDeDesvio':
            return 'Desvio';
        default:
            return 'atributo';
    }
}

function applyAttributePoint(playerPokemon, player, attributeKey) {
    if (!playerPokemon || !playerPokemon.stats || !player) {
        return;
    }

    const stats = playerPokemon.stats;
    switch (attributeKey) {
        case 'Vida':
            stats.Vida = (Number(stats.Vida) || 0) + 8;
            break;
        case 'DanoDeAtaque':
            stats.DanoDeAtaque = (Number(stats.DanoDeAtaque) || 0) + 2;
            break;
        case 'AtaqueEspecial':
            stats.AtaqueEspecial = (Number(stats.AtaqueEspecial) || 0) + 2;
            break;
        case 'DefesaDeAtaque':
            stats.DefesaDeAtaque = (Number(stats.DefesaDeAtaque) || 0) + 2;
            break;
        case 'DefesaDeAtaqueEspecial':
            stats.DefesaDeAtaqueEspecial = (Number(stats.DefesaDeAtaqueEspecial) || 0) + 2;
            break;
        case 'Velocidade':
            stats.Velocidade = (Number(stats.Velocidade) || 0) + 2;
            break;
        case 'ChanceDeDesvio':
            stats.ChanceDeDesvio = (Number(stats.ChanceDeDesvio) || 0) + 1;
            break;
        default:
            return;
    }

    if (!Number.isFinite(Number(playerPokemon.hpCurrent))) {
        playerPokemon.hpCurrent = getPlayerMaxHp(playerPokemon);
    } else if (attributeKey === 'Vida') {
        playerPokemon.hpCurrent = clampNumber(
            Number(playerPokemon.hpCurrent) + 8,
            0,
            getPlayerMaxHp(playerPokemon)
        );
    }

    player.pointsAllocated = player.pointsAllocated || {};
    player.pointsAllocated[attributeKey] = (Number(player.pointsAllocated[attributeKey]) || 0) + 1;
    player.attributePoints = Math.max(0, (Number(player.attributePoints) || 0) - 1);
}

function sumAllocatedPoints(pointsAllocated) {
    const values = pointsAllocated ? Object.values(pointsAllocated) : [];
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function applyAllocatedPointsToPokemon(playerPokemon, player) {
    if (!playerPokemon || !playerPokemon.stats || !player) {
        return;
    }

    const points = player.pointsAllocated || {};
    const stats = playerPokemon.stats;
    stats.Vida = (Number(stats.Vida) || 0) + (Number(points.Vida) || 0) * 8;
    stats.DanoDeAtaque = (Number(stats.DanoDeAtaque) || 0) + (Number(points.DanoDeAtaque) || 0) * 2;
    stats.AtaqueEspecial = (Number(stats.AtaqueEspecial) || 0) + (Number(points.AtaqueEspecial) || 0) * 2;
    stats.DefesaDeAtaque = (Number(stats.DefesaDeAtaque) || 0) + (Number(points.DefesaDeAtaque) || 0) * 2;
    stats.DefesaDeAtaqueEspecial = (Number(stats.DefesaDeAtaqueEspecial) || 0) + (Number(points.DefesaDeAtaqueEspecial) || 0) * 2;
    stats.Velocidade = (Number(stats.Velocidade) || 0) + (Number(points.Velocidade) || 0) * 2;
    stats.ChanceDeDesvio = (Number(stats.ChanceDeDesvio) || 0) + (Number(points.ChanceDeDesvio) || 0) * 1;
    playerPokemon.stats = stats;

    playerPokemon.hpCurrent = getPlayerMaxHp(playerPokemon);
}

function resetPokemonForRespec(playerPokemon, player) {
    if (!playerPokemon || !playerPokemon.stats || !player) {
        return 0;
    }

    const pointsAllocated = player.pointsAllocated || {};
    const totalPoints = sumAllocatedPoints(pointsAllocated);
    const normalizedType = normalizeType(playerPokemon.type, playerPokemon.stats.Traducao);
    const baseStats = getStatusInicial(normalizedType);
    const stats = { ...playerPokemon.stats };

    stats.Vida = Math.max(baseStats.Vida, (Number(stats.Vida) || 0) - (Number(pointsAllocated.Vida) || 0) * 8);
    stats.DanoDeAtaque = Math.max(baseStats.DanoDeAtaque, (Number(stats.DanoDeAtaque) || 0) - (Number(pointsAllocated.DanoDeAtaque) || 0) * 2);
    stats.AtaqueEspecial = Math.max(baseStats.AtaqueEspecial, (Number(stats.AtaqueEspecial) || 0) - (Number(pointsAllocated.AtaqueEspecial) || 0) * 2);
    stats.DefesaDeAtaque = Math.max(baseStats.DefesaDeAtaque, (Number(stats.DefesaDeAtaque) || 0) - (Number(pointsAllocated.DefesaDeAtaque) || 0) * 2);
    stats.DefesaDeAtaqueEspecial = Math.max(baseStats.DefesaDeAtaqueEspecial, (Number(stats.DefesaDeAtaqueEspecial) || 0) - (Number(pointsAllocated.DefesaDeAtaqueEspecial) || 0) * 2);
    stats.Velocidade = Math.max(baseStats.Velocidade, (Number(stats.Velocidade) || 0) - (Number(pointsAllocated.Velocidade) || 0) * 2);
    stats.ChanceDeDesvio = Math.max(baseStats.ChanceDeDesvio, (Number(stats.ChanceDeDesvio) || 0) - (Number(pointsAllocated.ChanceDeDesvio) || 0));
    stats.Traducao = baseStats.Traducao;

    playerPokemon.stats = stats;
    playerPokemon.type = normalizedType;

    const maxHp = getPlayerMaxHp(playerPokemon);
    if (!Number.isFinite(Number(playerPokemon.hpCurrent))) {
        playerPokemon.hpCurrent = maxHp;
    } else {
        playerPokemon.hpCurrent = clampNumber(Number(playerPokemon.hpCurrent), 0, maxHp);
    }

    player.pointsAllocated = { ...getDefaultPlayer().pointsAllocated };
    player.attributePoints = totalPoints;
    player.xpToNext = getXpToNext(playerPokemon.level);

    return totalPoints;
}

function getHitChance(baseChance, attackerStats, defenderStats) {
    const attackerVel = Number(attackerStats.Velocidade) || 0;
    const defenderVel = Number(defenderStats.Velocidade) || 0;
    const velocityMod = clampNumber((attackerVel - defenderVel) * 0.2, -10, 10);
    const evasion = Number(defenderStats.ChanceDeDesvio) || 0;
    return clampNumber(baseChance + velocityMod - evasion, 0, 100);
}

function rollHit(chance) {
    return Math.random() * 100 < chance;
}

function calculateDamage(base, level, defense, targetMaxHp, targetDefending) {
    const variance = Math.floor(Math.random() * 6);
    const raw = (base * (0.6 + level * 0.05)) - (defense * 0.3) + variance;
    let damage = Math.max(1, Math.floor(raw));

    if (targetDefending) {
        damage = Math.max(1, Math.floor(damage * 0.6));
    }

    const maxDamage = Math.max(1, Math.floor(targetMaxHp * 0.35));
    return Math.min(damage, maxDamage);
}

function ensureBattleState(activeGymRun, playerPokemon) {
    const enemy = getGymEnemyByStage(activeGymRun);
    if (!activeGymRun.battle) {
        activeGymRun.battle = createGymBattleState(playerPokemon, enemy);
    }

    const battle = activeGymRun.battle;
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const enemyMaxHp = getEnemyMaxHp(enemy);

    if (!Number.isFinite(Number(battle.playerHpCurrent))) {
        battle.playerHpCurrent = playerMaxHp;
    }
    if (!Number.isFinite(Number(battle.enemyHpCurrent))) {
        battle.enemyHpCurrent = enemy ? (Number(enemy.hpCurrent) || enemyMaxHp) : 0;
    }

    battle.energy = Number(battle.energy) || 0;
    battle.enemyEnergy = Number(battle.enemyEnergy) || 0;
    battle.specialCooldown = Number(battle.specialCooldown) || 0;
    battle.enemySpecialCooldown = Number(battle.enemySpecialCooldown) || 0;
    battle.defending = Boolean(battle.defending);
    battle.statuses = Array.isArray(battle.statuses) ? battle.statuses : [];

    if (enemy) {
        enemy.hpCurrent = battle.enemyHpCurrent;
    }

    return { battle, enemy };
}

function appendOptionsText(baseSpeech, optionsText) {
    if (!optionsText) {
        return baseSpeech || '';
    }

    if (!baseSpeech) {
        return optionsText;
    }

    if (baseSpeech.includes(optionsText)) {
        return baseSpeech;
    }

    return `${baseSpeech} ${optionsText}`;
}

function getDefaultOptions(sessionAttributes) {
    const state = sessionAttributes ? sessionAttributes.state : SESSION_STATES.IDLE;
    if (state === SESSION_STATES.BATTLE_TURN_MENU) {
        return { text: BATTLE_MENU_SPEECH, reprompt: BATTLE_MENU_REPROMPT };
    }
    if (state === SESSION_STATES.ALLOCATE_POINTS) {
        return { text: ALLOCATE_POINTS_PROMPT, reprompt: ALLOCATE_POINTS_REPROMPT };
    }
    if (state === SESSION_STATES.POST_BOSS_CHOICE) {
        return { text: OPTIONS_POST_BOSS, reprompt: POST_BOSS_CHOICE_REPROMPT };
    }
    if (state === SESSION_STATES.CAPTURE_NEW_REWARD) {
        return { text: OPTIONS_CAPTURE_REWARD, reprompt: SHORT_YES_NO_PROMPT };
    }
    if (state === SESSION_STATES.RESPEC_MENU) {
        return { text: RESPEC_MENU_PROMPT, reprompt: RESPEC_MENU_REPROMPT };
    }
    if (state === SESSION_STATES.GYM_CONFIRM_START) {
        return { text: OPTIONS_GYM_CONFIRM, reprompt: SHORT_YES_NO_PROMPT };
    }

    const hasEncounter = Boolean(sessionAttributes && sessionAttributes.encounter);
    const hasPokemon = Boolean(getCapturedPokemon(sessionAttributes));
    const hasWildBattle = Boolean(sessionAttributes && sessionAttributes.battle && sessionAttributes.battle.enemy);

    if (hasEncounter && !hasPokemon) {
        return { text: OPTIONS_CAPTURE, reprompt: SHORT_YES_NO_PROMPT };
    }

    if (hasWildBattle) {
        return { text: OPTIONS_WILD_BATTLE, reprompt: SHORT_BATTLE_REPROMPT };
    }

    if (hasPokemon) {
        return { text: OPTIONS_IDLE_WITH_POKEMON, reprompt: 'Modo batalha ou entrar no ginasio?' };
    }

    return { text: OPTIONS_IDLE_NO_POKEMON, reprompt: SHORT_CATCH_PROMPT };
}

function buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput, optionsOverride, repromptOverride, shouldEndSession) {
    const defaultOptions = getDefaultOptions(sessionAttributes);
    let optionsText = defaultOptions.text;
    let repromptText = defaultOptions.reprompt;

    if (typeof optionsOverride === 'string' && optionsOverride) {
        optionsText = optionsOverride;
        repromptText = repromptOverride || optionsOverride;
    } else if (optionsOverride && typeof optionsOverride === 'object') {
        optionsText = optionsOverride.text || optionsText;
        repromptText = optionsOverride.reprompt || repromptOverride || optionsText;
    } else if (repromptOverride) {
        repromptText = repromptOverride;
    }

    const speakWithOptions = appendOptionsText(speakOutput, optionsText);
    let builder = handlerInput.responseBuilder.speak(speakWithOptions);
    if (shouldEndSession) {
        builder = builder.withShouldEndSession(true);
        return builder.getResponse();
    }

    return builder.reprompt(repromptText).getResponse();
}

function buildBattleMenuResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.BATTLE_TURN_MENU;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const speakOutput = extraSpeech || '';
    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        speakOutput,
        { text: BATTLE_MENU_SPEECH, reprompt: BATTLE_MENU_REPROMPT }
    );
}

function buildAllocatePointsResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.ALLOCATE_POINTS;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const speakOutput = extraSpeech || '';
    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        speakOutput,
        { text: ALLOCATE_POINTS_PROMPT, reprompt: ALLOCATE_POINTS_REPROMPT }
    );
}

function buildPostBossChoiceResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.POST_BOSS_CHOICE;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const speakOutput = extraSpeech || '';
    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        speakOutput,
        { text: POST_BOSS_CHOICE_PROMPT, reprompt: POST_BOSS_CHOICE_REPROMPT }
    );
}

function buildRespecMenuResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.RESPEC_MENU;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const speakOutput = extraSpeech || '';
    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        speakOutput,
        { text: RESPEC_MENU_PROMPT, reprompt: RESPEC_MENU_REPROMPT }
    );
}

function buildCaptureRewardDecisionResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.CAPTURE_NEW_REWARD;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const reward = sessionAttributes.rewardPokemon;
    let rewardDetails = '';
    if (reward && reward.name) {
        const traducaoTipo = getStatusInicial(reward.type).Traducao;
        rewardDetails = `O novo Pokemon e ${reward.name} do tipo ${traducaoTipo}.`;
    }

    const parts = [];
    if (extraSpeech) {
        parts.push(extraSpeech);
    }
    if (rewardDetails) {
        parts.push(rewardDetails);
    }
    parts.push(CAPTURE_REWARD_REPROMPT);

    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        parts.join(' '),
        { text: OPTIONS_CAPTURE_REWARD, reprompt: SHORT_YES_NO_PROMPT }
    );
}

function buildContinueAfterAllocationResponse(handlerInput, sessionAttributes, extraSpeech) {
    sessionAttributes.state = SESSION_STATES.ALLOCATE_POINTS;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    const speakOutput = extraSpeech || '';
    return buildResponseWithOptions(
        handlerInput,
        sessionAttributes,
        speakOutput,
        { text: ALLOCATE_POINTS_CONTINUE_PROMPT, reprompt: ALLOCATE_POINTS_CONTINUE_REPROMPT }
    );
}

function chooseEnemyAction(battle, playerMaxHp) {
    const playerHpRatio = playerMaxHp > 0 ? battle.playerHpCurrent / playerMaxHp : 1;
    const wantsSpecial = playerHpRatio < 0.35
        ? Math.random() < 0.3
        : Math.random() < 0.3;

    if (wantsSpecial && battle.enemyEnergy >= 50 && battle.enemySpecialCooldown === 0) {
        return 'special';
    }

    return 'fast';
}

function advanceCooldowns(battle, playerUsedSpecial, enemyUsedSpecial) {
    if (!playerUsedSpecial && battle.specialCooldown > 0) {
        battle.specialCooldown = Math.max(0, battle.specialCooldown - 1);
    }

    if (!enemyUsedSpecial && battle.enemySpecialCooldown > 0) {
        battle.enemySpecialCooldown = Math.max(0, battle.enemySpecialCooldown - 1);
    }
}

function resolveItemKey(slotValue, player) {
    const inventory = player && player.inventory ? player.inventory : {};
    const raw = typeof slotValue === 'string' ? slotValue.toLowerCase() : '';
    const normalized = raw.replace(/\s+/g, '');

    if (normalized.includes('super')) {
        return 'superPotion';
    }

    if (normalized.includes('pocao') || normalized.includes('potion')) {
        return 'potion';
    }

    if (inventory.potion > 0) {
        return 'potion';
    }

    if (inventory.superPotion > 0) {
        return 'superPotion';
    }

    return null;
}

function performAttack(attackerStats, attackerLevel, defenderStats, defenderMaxHp, defenderDefending, baseChance, isSpecial) {
    const hitChance = getHitChance(baseChance, attackerStats, defenderStats);
    if (!rollHit(hitChance)) {
        return { hit: false, damage: 0 };
    }

    const baseDamage = isSpecial ? attackerStats.AtaqueEspecial : attackerStats.DanoDeAtaque;
    const defense = isSpecial ? defenderStats.DefesaDeAtaqueEspecial : defenderStats.DefesaDeAtaque;
    const damage = calculateDamage(
        Number(baseDamage) || 0,
        Number(attackerLevel) || DEFAULT_LEVEL,
        Number(defense) || 0,
        defenderMaxHp,
        defenderDefending
    );

    return { hit: true, damage };
}

async function handleGymBattleAction(handlerInput, actionType, itemSlotValue) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const activeGymRun = getActiveGymRun(sessionAttributes);

    if (!activeGymRun) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        const speakOutput = 'Nao ha ginasio em andamento. Diga "entrar no ginasio" para comecar.';
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    const playerPokemon = getCapturedPokemon(sessionAttributes);
    if (!playerPokemon) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        const speakOutput = 'Voce precisa capturar um Pokemon primeiro. Peca para cacar um.';
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    const player = getPlayer(sessionAttributes);
    if (Number(player.attributePoints) > 0 && !activeGymRun.battle) {
        return buildAllocatePointsResponse(
            handlerInput,
            sessionAttributes,
            'Voce tem pontos para distribuir antes de continuar.'
        );
    }

    if (sessionAttributes.state !== SESSION_STATES.BATTLE_TURN_MENU) {
        sessionAttributes.state = SESSION_STATES.BATTLE_TURN_MENU;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Vamos continuar a batalha.');
    }

    const { battle, enemy } = ensureBattleState(activeGymRun, playerPokemon);
    if (!enemy) {
        activeGymRun.inProgress = false;
        activeGymRun.battle = null;
        sessionAttributes.activeGymRun = activeGymRun;
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);

        const speakOutput = 'Nao consegui encontrar o adversario. Encerrando o ginasio.';
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    const playerStats = playerPokemon.stats || {};
    const enemyStats = enemy.stats || {};
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const enemyMaxHp = getEnemyMaxHp(enemy);

    battle.playerHpCurrent = clampNumber(Number(battle.playerHpCurrent) || 0, 0, playerMaxHp);
    battle.enemyHpCurrent = clampNumber(Number(battle.enemyHpCurrent) || 0, 0, enemyMaxHp);
    playerPokemon.hpCurrent = battle.playerHpCurrent;
    enemy.hpCurrent = battle.enemyHpCurrent;

    let playerUsedSpecial = false;
    let enemyUsedSpecial = false;
    const messages = [];

    if (actionType === 'special') {
        if (battle.energy < 50) {
            await saveAll(handlerInput, sessionAttributes);
            return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Voce nao tem energia suficiente para o especial.');
        }
        if (battle.specialCooldown > 0) {
            await saveAll(handlerInput, sessionAttributes);
            return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Seu especial esta em recarga.');
        }
    }

    if (actionType === 'item') {
        const player = getPlayer(sessionAttributes);
        const itemKey = resolveItemKey(itemSlotValue, player);
        if (!itemKey) {
            await saveAll(handlerInput, sessionAttributes);
            return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Voce nao tem itens disponiveis.');
        }

        if (!player.inventory || Number(player.inventory[itemKey]) <= 0) {
            await saveAll(handlerInput, sessionAttributes);
            return buildBattleMenuResponse(handlerInput, sessionAttributes, 'Voce nao tem esse item. Escolha outra acao.');
        }

        const healPercent = itemKey === 'superPotion' ? 0.6 : 0.3;
        const healAmount = Math.ceil(playerMaxHp * healPercent);
        battle.playerHpCurrent = clampNumber(battle.playerHpCurrent + healAmount, 0, playerMaxHp);
        player.inventory[itemKey] = Math.max(0, Number(player.inventory[itemKey]) - 1);
        setPlayer(sessionAttributes, player);
        playerPokemon.hpCurrent = battle.playerHpCurrent;

        messages.push(itemKey === 'superPotion'
            ? `Voce usou super pocao e recuperou ${healAmount} de HP.`
            : `Voce usou pocao e recuperou ${healAmount} de HP.`);
    } else if (actionType === 'defend') {
        battle.defending = true;
        battle.energy = clampNumber(battle.energy + 10, 0, 100);
        messages.push('Voce se preparou para defender.');
    } else if (actionType === 'flee') {
        const playerVel = Number(playerStats.Velocidade) || 0;
        const enemyVel = Number(enemyStats.Velocidade) || 0;
        const stageValue = Number(activeGymRun.stage) || 1;
        const fleeChance = clampNumber(40 + (playerVel - enemyVel) * 1.5 - (stageValue - 1) * 5, 10, 90);
        const fled = rollHit(fleeChance);

        if (fled) {
            const player = getPlayer(sessionAttributes);
            player.lossStreak = Number(player.lossStreak) + 1;
            setPlayer(sessionAttributes, player);

            activeGymRun.inProgress = false;
            activeGymRun.battle = null;
            sessionAttributes.activeGymRun = activeGymRun;
            sessionAttributes.state = SESSION_STATES.IDLE;
            sessionAttributes.gymResume = false;
            playerPokemon.hpCurrent = battle.playerHpCurrent;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            await saveAll(handlerInput, sessionAttributes);

            const speakOutput = 'Voce fugiu do ginasio. Sua sequencia de derrotas aumentou.';
            return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
        }

        messages.push('Voce nao conseguiu fugir.');
    } else {
        const isSpecial = actionType === 'special';
        const baseChance = isSpecial ? 75 : 85;
        const attackResult = performAttack(
            playerStats,
            playerPokemon.level || DEFAULT_LEVEL,
            enemyStats,
            enemyMaxHp,
            false,
            baseChance,
            isSpecial
        );

        if (attackResult.hit) {
            battle.enemyHpCurrent = clampNumber(battle.enemyHpCurrent - attackResult.damage, 0, enemyMaxHp);
            messages.push(`Voce acertou e causou ${attackResult.damage} de dano.`);
        } else {
            messages.push('Voce errou o ataque.');
        }

        if (isSpecial) {
            battle.energy = clampNumber(battle.energy - 50, 0, 100);
            battle.specialCooldown = 2;
            playerUsedSpecial = true;
        } else {
            battle.energy = clampNumber(battle.energy + 15, 0, 100);
        }
    }

    enemy.hpCurrent = battle.enemyHpCurrent;
    playerPokemon.hpCurrent = battle.playerHpCurrent;

    if (battle.enemyHpCurrent <= 0) {
        sessionAttributes.activeGymRun = activeGymRun;
        sessionAttributes.pokemon = playerPokemon;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return awardRewardsAndNextStep(handlerInput, sessionAttributes, messages.join(' '));
    }

    const enemyAction = chooseEnemyAction(battle, playerMaxHp);
    let enemyActionType = enemyAction;
    if (enemyActionType === 'special' && (battle.enemyEnergy < 50 || battle.enemySpecialCooldown > 0)) {
        enemyActionType = 'fast';
    }

    const enemyIsSpecial = enemyActionType === 'special';
    const enemyBaseChance = enemyIsSpecial ? 75 : 85;
    const enemyAttackResult = performAttack(
        enemyStats,
        enemy.level || DEFAULT_LEVEL,
        playerStats,
        playerMaxHp,
        battle.defending,
        enemyBaseChance,
        enemyIsSpecial
    );

    if (enemyAttackResult.hit) {
        battle.playerHpCurrent = clampNumber(battle.playerHpCurrent - enemyAttackResult.damage, 0, playerMaxHp);
        messages.push(enemyIsSpecial
            ? `O adversario usou especial e causou ${enemyAttackResult.damage} de dano.`
            : `O adversario atacou e causou ${enemyAttackResult.damage} de dano.`);
    } else {
        messages.push(enemyIsSpecial ? 'O adversario errou o especial.' : 'O adversario errou o ataque.');
    }

    if (enemyIsSpecial) {
        battle.enemyEnergy = clampNumber(battle.enemyEnergy - 50, 0, 100);
        battle.enemySpecialCooldown = 2;
        enemyUsedSpecial = true;
    } else {
        battle.enemyEnergy = clampNumber(battle.enemyEnergy + 15, 0, 100);
    }

    battle.defending = false;

    if (battle.playerHpCurrent <= 0) {
        sessionAttributes.activeGymRun = activeGymRun;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handleGymDefeat(handlerInput, sessionAttributes, messages.join(' '));
    }

    advanceCooldowns(battle, playerUsedSpecial, enemyUsedSpecial);
    battle.turn = Number(battle.turn || 1) + 1;
    enemy.hpCurrent = battle.enemyHpCurrent;
    playerPokemon.hpCurrent = battle.playerHpCurrent;
    sessionAttributes.activeGymRun = activeGymRun;
    sessionAttributes.pokemon = playerPokemon;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);

    return buildBattleMenuResponse(handlerInput, sessionAttributes, messages.join(' '));
}

async function finalizeBossChoice(handlerInput, sessionAttributes, extraSpeech) {
    delete sessionAttributes.rewardPokemon;
    const player = getPlayer(sessionAttributes);

    if (Number(player.respecTokens) > 0) {
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);
        return buildRespecMenuResponse(handlerInput, sessionAttributes, extraSpeech);
    }

    sessionAttributes.state = SESSION_STATES.IDLE;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);

    const speakOutput = extraSpeech || 'Tudo certo.';
    return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
}

async function acceptRewardPokemon(handlerInput, sessionAttributes) {
    const reward = sessionAttributes.rewardPokemon;
    const playerPokemon = getCapturedPokemon(sessionAttributes);
    if (!reward || !reward.name || !playerPokemon) {
        return finalizeBossChoice(handlerInput, sessionAttributes, 'Nao consegui trocar o Pokemon agora.');
    }

    const player = getPlayer(sessionAttributes);
    const level = Math.max(1, Number(playerPokemon.level) || DEFAULT_LEVEL);
    const newPokemon = buildPokemon(reward.name, reward.type, level);
    applyAllocatedPointsToPokemon(newPokemon, player);
    newPokemon.hpCurrent = getPlayerMaxHp(newPokemon);

    sessionAttributes.pokemon = newPokemon;
    player.xpToNext = getXpToNext(newPokemon.level);
    setPlayer(sessionAttributes, player);

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);

    const speakOutput = `Pronto! Voce trocou para ${newPokemon.name}.`;
    return finalizeBossChoice(handlerInput, sessionAttributes, speakOutput);
}

async function handleRespecDecision(handlerInput, sessionAttributes, wantsRespec) {
    const player = getPlayer(sessionAttributes);
    if (!wantsRespec) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(
            handlerInput,
            sessionAttributes,
            'Tudo bem. Se quiser redistribuir depois, e so avisar.'
        );
    }

    if (Number(player.respecTokens) <= 0) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(
            handlerInput,
            sessionAttributes,
            'Voce nao tem tokens de redistribuicao no momento.'
        );
    }

    const playerPokemon = getCapturedPokemon(sessionAttributes);
    if (!playerPokemon) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(
            handlerInput,
            sessionAttributes,
            'Nao encontrei seu Pokemon para redistribuir agora.'
        );
    }

    const totalPoints = resetPokemonForRespec(playerPokemon, player);
    player.respecTokens = Math.max(0, Number(player.respecTokens) - 1);
    setPlayer(sessionAttributes, player);
    sessionAttributes.pokemon = playerPokemon;

    if (totalPoints <= 0) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(
            handlerInput,
            sessionAttributes,
            'Nao ha pontos para redistribuir.'
        );
    }

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);
    return buildAllocatePointsResponse(handlerInput, sessionAttributes, 'Pontos liberados para redistribuicao.');
}

async function startNextGymBattle(handlerInput, sessionAttributes, extraSpeech) {
    const activeGymRun = getActiveGymRun(sessionAttributes);
    const playerPokemon = getCapturedPokemon(sessionAttributes);

    if (!activeGymRun || !playerPokemon) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        const speakOutput = 'Nao consegui continuar o ginasio.';
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    const enemy = getGymEnemyByStage(activeGymRun);
    if (!enemy) {
        activeGymRun.inProgress = false;
        activeGymRun.battle = null;
        sessionAttributes.activeGymRun = activeGymRun;
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);

        const speakOutput = 'O ginasio foi encerrado.';
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    if (!activeGymRun.battle) {
        activeGymRun.battle = createGymBattleState(playerPokemon, enemy, playerPokemon.hpCurrent);
    }

    sessionAttributes.activeGymRun = activeGymRun;
    sessionAttributes.pokemon = playerPokemon;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);

    const stageLabel = activeGymRun.stage || 1;
    const enemyLabel = enemy.isBoss ? `o Lider ${enemy.name}` : `o treinador ${enemy.name}`;
    const baseMessage = `Estagio ${stageLabel}. Seu adversario e ${enemyLabel}.`;
    const speakOutput = extraSpeech ? `${extraSpeech} ${baseMessage}` : baseMessage;

    return buildBattleMenuResponse(handlerInput, sessionAttributes, speakOutput);
}

async function awardRewardsAndNextStep(handlerInput, sessionAttributes, extraSpeech) {
    const activeGymRun = sessionAttributes.activeGymRun;
    const playerPokemon = getCapturedPokemon(sessionAttributes);
    if (!activeGymRun || !playerPokemon) {
        sessionAttributes.state = SESSION_STATES.IDLE;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        const speakOutput = 'Nao consegui continuar o ginasio.';
        await saveAll(handlerInput, sessionAttributes);
        return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
    }

    const player = getPlayer(sessionAttributes);
    const defeatedEnemy = getGymEnemyByStage(activeGymRun);
    const stageValue = Number(activeGymRun.stage) || 1;
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const baseMessage = extraSpeech ? `${extraSpeech} ` : '';
    const enemyLabel = defeatedEnemy
        ? (defeatedEnemy.isBoss ? `o Lider ${defeatedEnemy.name}` : `o treinador ${defeatedEnemy.name}`)
        : 'o adversario';
    const victoryMessage = `${baseMessage}Voce venceu ${enemyLabel}.`;

    const enemyLevel = defeatedEnemy ? Number(defeatedEnemy.level) || DEFAULT_LEVEL : DEFAULT_LEVEL;
    const xpGained = defeatedEnemy
        ? (defeatedEnemy.isBoss ? 80 + enemyLevel * 10 : 25 + enemyLevel * 5)
        : 0;

    const carryHp = activeGymRun.battle ? activeGymRun.battle.playerHpCurrent : playerPokemon.hpCurrent;
    if (Number.isFinite(Number(carryHp))) {
        playerPokemon.hpCurrent = clampNumber(Number(carryHp), 0, playerMaxHp);
    }

    const levelResult = applyXpAndLevel(player, playerPokemon, xpGained);
    setPlayer(sessionAttributes, player);
    sessionAttributes.pokemon = playerPokemon;

    const messageParts = [victoryMessage];
    if (xpGained > 0) {
        messageParts.push(`Voce ganhou ${xpGained} de XP.`);
    }

    if (stageValue < GYM_TOTAL_STAGES) {
        const healInfo = applyBetweenFightHealing(playerPokemon, stageValue);
        if (healInfo.healAmount > 0) {
            messageParts.push(`Seu Pokemon recuperou ${healInfo.healAmount} de vida.`);
        }
    }

    if (levelResult.levelsGained > 0) {
        messageParts.push(`Voce subiu para o nivel ${levelResult.newLevel} e ganhou ${levelResult.pointsGained} pontos.`);
    }

    const summaryMessage = messageParts.join(' ');
    const hasPoints = Number(player.attributePoints) > 0;

    if (stageValue >= GYM_TOTAL_STAGES) {
        const currentGeneration = Number(player.currentGeneration) || 1;
        const nextGeneration = Math.min(MAX_GENERATION, currentGeneration + 1);
        player.currentGeneration = nextGeneration;
        player.respecTokens = (Number(player.respecTokens) || 0) + 1;
        setPlayer(sessionAttributes, player);

        activeGymRun.inProgress = false;
        activeGymRun.battle = null;
        sessionAttributes.activeGymRun = activeGymRun;
        sessionAttributes.state = SESSION_STATES.POST_BOSS_CHOICE;
        sessionAttributes.gymResume = false;
        delete sessionAttributes.rewardPokemon;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);

        const bossMessage = `${summaryMessage} Voce venceu o Lider! A proxima regiao foi desbloqueada.`;
        return buildPostBossChoiceResponse(handlerInput, sessionAttributes, bossMessage);
    }

    activeGymRun.stage = stageValue + 1;
    activeGymRun.battle = null;
    sessionAttributes.activeGymRun = activeGymRun;
    sessionAttributes.pokemon = playerPokemon;

    if (hasPoints) {
        sessionAttributes.state = SESSION_STATES.ALLOCATE_POINTS;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        await saveAll(handlerInput, sessionAttributes);

        const allocationMessage = levelResult.levelsGained > 0
            ? summaryMessage
            : `${summaryMessage} Voce tem ${player.attributePoints} pontos para distribuir.`;
        return buildAllocatePointsResponse(handlerInput, sessionAttributes, allocationMessage);
    }

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return startNextGymBattle(handlerInput, sessionAttributes, summaryMessage);
}

async function handleGymDefeat(handlerInput, sessionAttributes, extraSpeech) {
    const activeGymRun = sessionAttributes.activeGymRun;
    const playerPokemon = getCapturedPokemon(sessionAttributes);
    const player = getPlayer(sessionAttributes);
    const playerMaxHp = getPlayerMaxHp(playerPokemon);
    const recoveryHp = Math.ceil(playerMaxHp * 0.5);

    if (activeGymRun) {
        activeGymRun.inProgress = false;
        activeGymRun.battle = null;
        sessionAttributes.activeGymRun = activeGymRun;
    }

    player.lossStreak = Number(player.lossStreak) + 1;
    setPlayer(sessionAttributes, player);

    if (playerPokemon) {
        playerPokemon.hpCurrent = recoveryHp;
        sessionAttributes.pokemon = playerPokemon;
    }

    sessionAttributes.state = SESSION_STATES.IDLE;
    sessionAttributes.gymResume = false;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    await saveAll(handlerInput, sessionAttributes);

    const baseMessage = extraSpeech ? `${extraSpeech} ` : '';
    const speakOutput = `${baseMessage}Voce foi derrotado. O ginasio foi encerrado e seu Pokemon se recuperou parcialmente.`;
    return buildResponseWithOptions(handlerInput, sessionAttributes, speakOutput);
}

function getDefaultPlayer() {
    return {
        currentGeneration: 1,
        xp: 0,
        xpToNext: 50,
        attributePoints: 0,
        pointsAllocated: {
            Vida: 0,
            DanoDeAtaque: 0,
            AtaqueEspecial: 0,
            DefesaDeAtaque: 0,
            DefesaDeAtaqueEspecial: 0,
            Velocidade: 0,
            ChanceDeDesvio: 0
        },
        inventory: {
            potion: 2,
            superPotion: 0,
            buffAtk: 0
        },
        respecTokens: 0,
        lossStreak: 0
    };
}

function mergePlayerDefaults(player) {
    const defaults = getDefaultPlayer();
    const source = player || {};

    return {
        ...defaults,
        ...source,
        pointsAllocated: {
            ...defaults.pointsAllocated,
            ...(source.pointsAllocated || {})
        },
        inventory: {
            ...defaults.inventory,
            ...(source.inventory || {})
        }
    };
}

function getPlayer(sessionAttributes) {
    if (!sessionAttributes) {
        return getDefaultPlayer();
    }

    const merged = mergePlayerDefaults(sessionAttributes.player);
    sessionAttributes.player = merged;
    return merged;
}

function setPlayer(sessionAttributes, player) {
    if (!sessionAttributes) {
        return null;
    }

    sessionAttributes.player = mergePlayerDefaults(player);
    return sessionAttributes.player;
}

function ensureSessionState(sessionAttributes) {
    if (!SESSION_STATE_VALUES.has(sessionAttributes.state)) {
        sessionAttributes.state = SESSION_STATES.IDLE;
    }
}

async function getPersistentRoot(handlerInput, sessionAttributes) {
    const existing = await handlerInput.attributesManager.getPersistentAttributes() || {};
    const normalized = normalizePersistentAttributes(existing);
    const merged = {
        ...existing,
        ...normalized
    };

    if (sessionAttributes && sessionAttributes.pokemon) {
        merged.pokemon = sessionAttributes.pokemon;
    }

    if (sessionAttributes && sessionAttributes.player) {
        merged.player = mergePlayerDefaults(sessionAttributes.player);
    } else {
        merged.player = mergePlayerDefaults(merged.player);
    }

    if (sessionAttributes && Object.prototype.hasOwnProperty.call(sessionAttributes, 'activeGymRun')) {
        merged.activeGymRun = sessionAttributes.activeGymRun;
    } else if (!Object.prototype.hasOwnProperty.call(merged, 'activeGymRun')) {
        merged.activeGymRun = null;
    }

    return merged;
}

async function saveAll(handlerInput, sessionAttributes) {
    const persistentRoot = await getPersistentRoot(handlerInput, sessionAttributes);
    handlerInput.attributesManager.setPersistentAttributes(persistentRoot);
    await handlerInput.attributesManager.savePersistentAttributes();
}

function normalizePersistentAttributes(persistentAttributes) {
    const root = persistentAttributes || {};
    const normalized = {
        player: mergePlayerDefaults(root.player),
        activeGymRun: Object.prototype.hasOwnProperty.call(root, 'activeGymRun')
            ? normalizeActiveGymRun(root.activeGymRun)
            : null
    };

    if (root.pokemon && root.pokemon.name) {
        const stored = root.pokemon;
        const type = normalizeType(stored.type, stored.stats && stored.stats.Traducao);
        const baseStats = getStatusInicial(type);
        const stats = Object.assign({}, baseStats, stored.stats || {});
        const level = Number(stored.level || stored.nivel || stored.Nivel || DEFAULT_LEVEL);
        const hpCurrent = Number(stored.hpCurrent);

        const pokemon = {
            name: stored.name,
            type,
            level: level > 0 ? level : DEFAULT_LEVEL,
            stats
        };
        if (Number.isFinite(hpCurrent)) {
            pokemon.hpCurrent = hpCurrent;
        }
        normalized.pokemon = pokemon;
    } else if (root.nome) {
        const type = normalizeType(null, root.Traducao);
        const baseStats = getStatusInicial(type);
        const level = Number(root.Nivel || root.nivel || DEFAULT_LEVEL);
        const stats = {
            Vida: root.Vida || baseStats.Vida,
            DanoDeAtaque: root.DanoDeAtaque || baseStats.DanoDeAtaque,
            AtaqueEspecial: root.AtaqueEspecial || baseStats.AtaqueEspecial,
            DefesaDeAtaque: root.DefesaDeAtaque || baseStats.DefesaDeAtaque,
            DefesaDeAtaqueEspecial: root.DefesaDeAtaqueEspecial || baseStats.DefesaDeAtaqueEspecial,
            ChanceDeDesvio: root.ChanceDeDesvio || baseStats.ChanceDeDesvio,
            Velocidade: root.Velocidade || baseStats.Velocidade,
            Traducao: root.Traducao || baseStats.Traducao
        };

        const hpCurrent = Number(root.hpCurrent);
        const pokemon = {
            name: root.nome,
            type,
            level: level > 0 ? level : DEFAULT_LEVEL,
            stats
        };
        if (Number.isFinite(hpCurrent)) {
            pokemon.hpCurrent = hpCurrent;
        }
        normalized.pokemon = pokemon;
    }

    if (normalized.pokemon) {
        normalized.player.xpToNext = getXpToNext(normalized.pokemon.level);
    }

    return normalized;
}

function mapTranslationToType(traducao) {
    if (!traducao) {
        return null;
    }

    const normalized = traducao.toLowerCase();
    const map = {
        normal: 'normal',
        fogo: 'fire',
        agua: 'water',
        'água': 'water',
        eletrico: 'electric',
        'elétrico': 'electric',
        grama: 'grass',
        gelo: 'ice',
        lutador: 'fighting',
        venenoso: 'poison',
        terrestre: 'ground',
        voador: 'flying',
        psiquico: 'psychic',
        'psíquico': 'psychic',
        inseto: 'bug',
        pedra: 'rock',
        fantasma: 'ghost',
        dragao: 'dragon',
        'dragão': 'dragon',
        noturno: 'dark',
        metal: 'steel',
        aco: 'steel',
        'aço': 'steel',
        fada: 'fairy'
    };

    return map[normalized] || null;
}

function normalizeType(type, traducao) {
    if (type && STATUS_BASE[type]) {
        return type;
    }

    return mapTranslationToType(type) || mapTranslationToType(traducao) || 'normal';
}

function normalizeActiveGymRun(run) {
    if (!run || typeof run !== 'object') {
        return null;
    }

    const stageValue = Number(run.stage) || 1;
    const normalized = {
        ...run,
        inProgress: Boolean(run.inProgress),
        stage: stageValue
    };

    normalized.enemies = Array.isArray(run.enemies) ? run.enemies : [];
    normalized.battle = run.battle && typeof run.battle === 'object' ? run.battle : null;

    return normalized;
}

function getActiveGymRun(sessionAttributes) {
    const run = sessionAttributes && sessionAttributes.activeGymRun;
    if (!run || !run.inProgress) {
        return null;
    }

    if (!Array.isArray(run.enemies) || run.enemies.length === 0) {
        return null;
    }

    return run;
}

function getGymEnemyByStage(activeGymRun) {
    if (!activeGymRun || !Array.isArray(activeGymRun.enemies) || activeGymRun.enemies.length === 0) {
        return null;
    }

    const stage = Math.min(
        Math.max(1, Number(activeGymRun.stage) || 1),
        activeGymRun.enemies.length
    );
    return activeGymRun.enemies[stage - 1];
}

function getCapturedPokemon(sessionAttributes) {
    if (sessionAttributes && sessionAttributes.pokemon && sessionAttributes.pokemon.name) {
        return sessionAttributes.pokemon;
    }

    return null;
}

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        GetSorteioPokemonIntentHandler,
        SetGenerationIntentHandler,
        EnterGymIntentHandler,
        YesIntentHandler,
        NoIntentHandler,
        GymAttackIntentHandler,
        GymSpecialIntentHandler,
        GymDefendIntentHandler,
        GymItemIntentHandler,
        GymFleeIntentHandler,
        StatusIntentHandler,
        KeepPokemonIntentHandler,
        CaptureNewPokemonIntentHandler,
        AllocatePointsIntentHandler,
        HelpIntentHandler,
        ModoBatalhaIntentHandler,
        TentarNovamenteIntentHandler,
        CapturePokemonIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addRequestInterceptors(LoadPersistentAttributesInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({ apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION })
        })
    )
    .lambda();








