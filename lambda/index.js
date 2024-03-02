/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const axios = require('axios');
const AWS = require ("aws-sdk");
const ddbAdapter = require ('ask-sdk-dynamodb-persistence-adapter');


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Bem vindo a cidade de Pallett Treinador! me peça para caçar um pokemon!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
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
        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            if (sessionAttributes.captured) {
                const pokemonName = sessionAttributes.pokemonName;
                const speakOutput = `Você já tem ${pokemonName} como seu Pokémon inicial. Não é possível capturar outro. Fale "Modo batalha" para iniciar sua jornada ao lado de ${pokemonName}.`;
                return handlerInput.responseBuilder.speak(speakOutput).getResponse();
            }

            const response = await axios.get('https://pokeapi.co/api/v2/pokemon?offset=0&limit=151');
            const pokemons = response.data.results;

            const randomPokemonIndex = Math.floor(Math.random() * 151);
            const randomPokemon = pokemons[randomPokemonIndex];
            sessionAttributes.pokemonName = randomPokemon.name;
            const pokemonName = randomPokemon.name;

            const pokemonUrl = randomPokemon.url;
            const pokemonResponse = await axios.get(pokemonUrl);
            const types = pokemonResponse.data.types;

            if (types.length > 0) {
                const firstType = types[0].type.name;
                const statusInicial = getStatusInicial(firstType);
                const traducaoTipo = statusInicial.Traducao;
                sessionAttributes.pokemonType = firstType; 

                const pokemonRarity = await getPokemonRarity(pokemonName);
                sessionAttributes.pokemonRarity = pokemonRarity;    
                const speakOutput = `O Pokémon Encontrado foi: ${pokemonName}! É do tipo ${traducaoTipo}. A chance de captura é de ${pokemonRarity.chanceDeCaptura}%. Você gostaria de tentar capturar este Pokémon?`;

                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt('Você gostaria de capturar este Pokémon?')
                    .getResponse();
            } else {
                return handlerInput.responseBuilder
                    .speak("Houve um problema ao buscar informações sobre o Pokémon. Tente novamente.")
                    .getResponse();
            }
        } catch (err) {
            const speakOutput = `Erro ao realizar busca: ${err.message}`;
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse();
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
        const pokemonRarity = sessionAttributes.pokemonRarity;

        if (!sessionAttributes.pokemonName) {
            return handlerInput.responseBuilder.speak("Você ainda não encontrou um Pokémon para capturar!").getResponse();
        }
        // Gerando um número aleatório para simular a tentativa de captura
        const randomNumber = Math.floor(Math.random() * 101);
        let speakOutput = "";

        if (pokemonRarity && randomNumber <= pokemonRarity.chanceDeCaptura) {
            sessionAttributes.captured = true;

            const StatusPokemon = getStatusInicial(sessionAttributes.pokemonType);

            var pokemonData  = {
                "nome": sessionAttributes.pokemonName,
                "Vida": StatusPokemon.Vida,
                "DanoDeAtaque": StatusPokemon.DanoDeAtaque,
                "AtaqueEspecial": StatusPokemon.AtaqueEspecial,
                "DefesaDeAtaque": StatusPokemon.DefesaDeAtaque,
                "DefesaDeAtaqueEspecial": StatusPokemon.DefesaDeAtaqueEspecial,
                "ChanceDeDesvio": StatusPokemon.ChanceDeDesvio,
                "Velocidade": StatusPokemon.Velocidade,
                "Traducao": StatusPokemon.Traducao
            }; 

            // Salvando atributos persistentes 
            await handlerInput.attributesManager.setPersistentAttributes(pokemonData);
            await handlerInput.attributesManager.savePersistentAttributes();
            sessionAttributes.pokemonData = pokemonData;

            // E então, quando for construir sua mensagem...
            const hp = sessionAttributes.pokemonData.Vida; // Ou DanoDeAtaque, dependendo de qual valor você quer mostrar.
            speakOutput = `Parabéns! Você capturou ${sessionAttributes.pokemonName}, com HP de ${hp}`;
        } else {
            speakOutput = await getErroCaptura(sessionAttributes.pokemonName);
            sessionAttributes.captureFailed = true;
        }

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();

    }
};


const TentarNovamenteIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TentarNovamenteIntent';
    },
    async handle(handlerInput) {
        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            
            if (sessionAttributes.captured) {
                return handlerInput.responseBuilder
                    .speak('Você já capturou um Pokémon. Não é possível tentar novamente.')
                    .getResponse();
            }

            const response = await GetSorteioPokemonIntentHandler.handle(handlerInput);
            
            return handlerInput.responseBuilder
                .speak(response.outputSpeech.ssml)
                .reprompt(response.reprompt.outputSpeech.ssml)
                .getResponse();
        } catch (err) {
            const speakOutput = `Erro ao tentar novamente: ${err.message}`;
            console.error(err);
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse();
        }
    }
};

const ModoBatalhaIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ModoBatalhaIntent';
    },
    handle(handlerInput) {
        const speakOutput = '"Estamos trabalhando duro para trazer a você um Modo de Batalha emocionante! Fique atento, em breve você poderá desfrutar de batalhas épicas com seus Pokémon.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};


exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        GetSorteioPokemonIntentHandler,
        CapturePokemonIntentHandler,
        TentarNovamenteIntentHandler,
        ModoBatalhaIntentHandler
    )
    .lambda();


const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Você pode dizer olá para mim! Como posso ajudar?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Adeus treinador!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Não entendi sua Intent .';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `Voce acionou ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Desculpe, tive problemas para fazer o que você pediu. Por favor, tente novamente.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

    async function getPokemonRarity(pokemonName) {
        const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${pokemonName}/`;
        const response = await axios.get(speciesUrl);
        const data = response.data;
        const captureRate = data.capture_rate;
        const chanceDeCaptura = Math.round((captureRate / 255) * 100);

        return {
            nome: pokemonName,
            chanceDeCaptura: chanceDeCaptura,
            mitico: data.is_mythical,
            lendario: data.is_legendary
        };
    }

    async function getErroCaptura(pokemonName) {

        const pokemonEscapou = [
            "escapou, devido à densa vegetação da floresta, que dificultou a captura. Os arbustos e árvores densas permitiram que o Pokémon se escondesse.",
            "conseguiu escapar, na caverna escura, onde sua agilidade e capacidade de se movimentar em ambientes escuros o ajudaram a se esquivar de você.",
            "correu na direção de um penhasco, e você não conseguiu alcançá-lo a tempo antes que ele pulasse para um local inacessível.",
            "escapou, Enquanto você tentava capturar, outro Pokémon selvagem apareceu e distraiu você",
            "escapou, você não conseguiu reagir a tempo pois estava distraído olhando em outra direção.",
            "Fugiu assustado pois um Pokémon selvagem mais forte apareceu e atacou o Pokémon alvo, .",
            "É particularmente ágil e conseguiu se esquivar de você de maneira surpreendentemente rápida.",
            "percebeu que estava em desvantagem e fugiu para preservar sua própria segurança.",
            "escapou sem ser visto. Mudanças repentinas no clima afetaram a sua visibilidade e a mobilidade.",
            "caiu em uma armadilha natural, como uma rede de teia de um Pokémon Bug, permitindo-lhe escapar de você."
        ];
        const randomIndex = Math.floor(Math.random() * pokemonEscapou.length);
        return `${pokemonName} ${pokemonEscapou[randomIndex]}, Peça para eu tentar novamente para caçar outro Pokémon.`;
}


function getStatusInicial(type) {
    const StatusBase = {
        normal: {
          "Vida": 100,
          "DanoDeAtaque": 20,//dano fisico
          "AtaqueEspecial": 15, //dano magico
          "DefesaDeAtaque": 20,// resistencia ao dano fisico
          "DefesaDeAtaqueEspecial": 20, //resistencia ao dano magico
          "ChanceDeDesvio": 10, // chance de desvio dos ataques
          "Velocidade": 20, // define se ataca primeiro
          "Traducao": "Normal"
        },
        fire: {
          "Vida": 90,
          "DanoDeAtaque": 25,
          "AtaqueEspecial": 30,
          "DefesaDeAtaque": 15,
          "DefesaDeAtaqueEspecial": 20,
          "ChanceDeDesvio": 15,
          "Velocidade": 25,
          "Traducao": "Fogo"
        },
        water: {
          "Vida": 95,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 25,
          "DefesaDeAtaque": 25,
          "DefesaDeAtaqueEspecial": 20,
          "ChanceDeDesvio": 12,
          "Velocidade": 18,
          "Traducao": "Água"
        },
        electric: {
          "Vida": 85,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 35,
          "DefesaDeAtaque": 15,
          "DefesaDeAtaqueEspecial": 15,
          "ChanceDeDesvio": 20,
          "Velocidade": 30,
          "Traducao": "Elétrico"
        },
        grass: {
          "Vida": 100,
          "DanoDeAtaque": 15,
          "AtaqueEspecial": 20,
          "DefesaDeAtaque": 20,
          "DefesaDeAtaqueEspecial": 25,
          "ChanceDeDesvio": 10,
          "Velocidade": 15,
          "Traducao": "Grama"
        },
        ice: {
          "Vida": 90,
          "DanoDeAtaque": 25,
          "AtaqueEspecial": 30,
          "DefesaDeAtaque": 15,
          "DefesaDeAtaqueEspecial": 15,
          "ChanceDeDesvio": 15,
          "Velocidade": 20,
          "Traducao": "Gelo"
        },
        fighting: {
          "Vida": 95,
          "DanoDeAtaque": 30,
          "AtaqueEspecial": 15,
          "DefesaDeAtaque": 25,
          "DefesaDeAtaqueEspecial": 10,
          "ChanceDeDesvio": 10,
          "Velocidade": 20,
          "Traducao": "Lutador"
        },
        poison: {
          Vida: 85,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 25,
          "DefesaDeAtaque": 20,
          "DefesaDeAtaqueEspecial": 25,
          "ChanceDeDesvio": 20,
          "Velocidade": 15,
          "Traducao": "Venenoso"
        },
        ground: {
          "Vida": 100,
          "DanoDeAtaque": 25,
          "AtaqueEspecial": 20,
          "DefesaDeAtaque": 30,
          "DefesaDeAtaqueEspecial": 20,
          "ChanceDeDesvio": 5,
          "Velocidade": 10,
          "Traducao": "Terrestre"
        },
        flying: {
          "Vida": 85,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 30,
          "DefesaDeAtaque": 15,
          "DefesaDeAtaqueEspecial": 15,
          "ChanceDeDesvio": 25,
          "Velocidade": 25,
          "Traducao": "Voador"
        },
        sychic: {
          "Vida": 80,
          "DanoDeAtaque": 15,
          "AtaqueEspecial": 40,
          "DefesaDeAtaque": 15,
          "DefesaDeAtaqueEspecial": 30,
          "ChanceDeDesvio": 20,
          "Velocidade": 20,
          "Traducao": "Psíquico"
        },
        bug: {
          "Vida": 90,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 15,
          "DefesaDeAtaque": 20,
          "DefesaDeAtaqueEspecial": 20,
          "ChanceDeDesvio": 15,
          "Velocidade": 25,
          "Traducao": "Inseto"
        },
        rock: {
          Vida: 95,
          "DanoDeAtaque": 30,
          "AtaqueEspecial": 10,
          "DefesaDeAtaque": 35,
          "DefesaDeAtaqueEspecial": 30,
          "ChanceDeDesvio": 5,
          "Velocidade": 10,
          "Traducao": "Pedra"
        },
        ghost: {
          "Vida": 85,
          "DanoDeAtaque": 20,
          "AtaqueEspecial": 35,
          "DefesaDeAtaque": 20,
          "DefesaDeAtaqueEspecial": 25,
          "ChanceDeDesvio": 30,
          "Velocidade": 20,
          "Traducao": "Fantasma"
        },
        dragon: {
          "Vida": 100,
          "DanoDeAtaque": 30,
          "AtaqueEspecial": 30,
          "DefesaDeAtaque": 25,
          "DefesaDeAtaqueEspecial": 25,
          "ChanceDeDesvio": 10,
          "Velocidade": 20,
          "Traducao": "Dragão"
        },
        noturno: {
          "Vida": 90,
          "DanoDeAtaque": 25,
          "AtaqueEspecial": 20,
          "DefesaDeAtaque": 20,
          "DefesaDeAtaqueEspecial": 20,
          "ChanceDeDesvio": 20,
          "Velocidade": 25,
          "Traducao": "Noturno"
        }
      }
      return StatusBase[type] || {
        "Vida": 90,
        "DanoDeAtaque": 20,
        "AtaqueEspecial": 15,
        "DefesaDeAtaque": 20,
        "DefesaDeAtaqueEspecial": 20,
        "ChanceDeDesvio": 10,
        "Velocidade": 20,
        "Traducao": "Desconhecido"
    };
}
/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        GetSorteioPokemonIntentHandler,
        HelpIntentHandler,
        ModoBatalhaIntentHandler,
        TentarNovamenteIntentHandler,
        CapturePokemonIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        })

    )
    .lambda();