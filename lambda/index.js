/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const axios = require('axios');


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

const typeTranslations = {
    normal: 'Normal',
    fire: 'Fogo',
    water: 'Água',
    electric: 'Elétrico',
    grass: 'Grama',
    ice: 'Gelo',
    fighting: 'Lutador',
    poison: 'Veneno',
    ground: 'Terrestre',
    flying: 'Voador',
    psychic: 'Psíquico',
    bug: 'Inseto',
    rock: 'Pedra',
    ghost: 'Fantasma',
    dragon: 'Dragão'
};

const tiposDePokemon = {
    normal: {
        HP: 100,
        Vida: 100,
        DanoDeAtaque: 20,
        ChanceDeDesvio: 10, // Em porcentagem
        ChanceDeFugir: 20, // Em porcentagem
    },
    fire: {
        HP: 90,
        Vida: 90,
        DanoDeAtaque: 25,
        ChanceDeDesvio: 15,
        ChanceDeFugir: 15,
    },
    water: {
        HP: 110,
        Vida: 110,
        DanoDeAtaque: 18,
        ChanceDeDesvio: 8,
        ChanceDeFugir: 25,
    },
    electric: {
        HP: 80,
        Vida: 80,
        DanoDeAtaque: 30,
        ChanceDeDesvio: 20,
        ChanceDeFugir: 10,
    },
    grass: {
        HP: 100,
        Vida: 100,
        DanoDeAtaque: 22,
        ChanceDeDesvio: 12,
        ChanceDeFugir: 15,
    },
    ice: {
        HP: 95,
        Vida: 95,
        DanoDeAtaque: 24,
        ChanceDeDesvio: 12,
        ChanceDeFugir: 18,
    },
    fighting: {
        HP: 105,
        Vida: 105,
        DanoDeAtaque: 28,
        ChanceDeDesvio: 18,
        ChanceDeFugir: 10,
    },
    poison: {
        HP: 85,
        Vida: 85,
        DanoDeAtaque: 20,
        ChanceDeDesvio: 10,
        ChanceDeFugir: 20,
    },
    ground: {
        HP: 115,
        Vida: 115,
        DanoDeAtaque: 26,
        ChanceDeDesvio: 10,
        ChanceDeFugir: 15,
    },
    flying: {
        HP: 90,
        Vida: 90,
        DanoDeAtaque: 28,
        ChanceDeDesvio: 20,
        ChanceDeFugir: 15,
    },
    psychic: {
        HP: 80,
        Vida: 80,
        DanoDeAtaque: 35,
        ChanceDeDesvio: 25,
        ChanceDeFugir: 5,
    },
    bug: {
        HP: 85,
        Vida: 85,
        DanoDeAtaque: 22,
        ChanceDeDesvio: 15,
        ChanceDeFugir: 20,
    },
    rock: {
        HP: 120,
        Vida: 120,
        DanoDeAtaque: 30,
        ChanceDeDesvio: 5,
        ChanceDeFugir: 10,
    },
    ghost: {
        HP: 70,
        Vida: 70,
        DanoDeAtaque: 18,
        ChanceDeDesvio: 25,
        ChanceDeFugir: 30,
    },
    dragon: {
        HP: 110,
        Vida: 110,
        DanoDeAtaque: 32,
        ChanceDeDesvio: 12,
        ChanceDeFugir: 10,
    },
    noturno: {
        HP: 75,
        Vida: 75,
        DanoDeAtaque: 20,
        ChanceDeDesvio: 18,
        ChanceDeFugir: 25,
    },
};

const GetSorteioPokemonIntentHandler = {
    canHandle (handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetSorteioPokemonIntent';
    },
    async handle(handlerInput) {
        try {
            
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            if (sessionAttributes.captured) {
                const speakOutput = `Você já tem ${sessionAttributes.pokemonName} como seu Pokémon inicial. Não é possível capturar outro. Fale "Modo batalha" para iniciar sua jornada ao lado de ${sessionAttributes.pokemonName}  `
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .getResponse();
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
            const typeNames = types.map(type => typeTranslations[type.type.name]); // Usar as traduções

            const hp = tiposDePokemon[typeNames[0]].HP; // Supondo que o primeiro tipo seja o principal
            const randomNumber1 = Math.floor(Math.random() * 101); // Gera um número aleatório entre 0 e 100
            const speakOutput = `O Pokémon Encontrado foi: ${pokemonName}! É do tipo ${typeNames.join(' e ')}. Tem ${hp} pontos de vida (HP). A chance de captura é de ${randomNumber1}%.
            Você gostaria de tentar capturar este Pokémon?`;

            handlerInput.attributesManager.setSessionAttributes({ pokemonName, randomNumber1, captured: false });

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('Você gostaria de capturar este Pokémon?')
                .getResponse();
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
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CapturePokemonIntent';
    },
    
    handle(handlerInput) {
        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            const { pokemonName, randomNumber1, captured } = sessionAttributes;
            let speakOutput = "";
            const randomNumber2 = Math.floor(Math.random() * 101); 
          
            if (randomNumber1 >= randomNumber2) {
                speakOutput = `Parabéns! Você capturou o Pokémon ${pokemonName}.`;
                
                sessionAttributes.captured = true; // Atualiza para indicar que o Pokémon foi capturado
            } else {
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
                const randomCapturePhrase = pokemonEscapou[randomIndex];
                

                sessionAttributes.captureFailed = true;
                speakOutput = `${pokemonName} ${randomCapturePhrase}, Peça para eu tentar novamente para caçar outro Pokémon.`;
            }

            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            return handlerInput.responseBuilder

                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        } catch (err) {
            const speakOutput = `Erro ao realizar captura: ${err.message}`;
            console.error(err);
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
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
    .lambda();