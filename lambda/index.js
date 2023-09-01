// Importações das bibliotecas necessárias
const Alexa = require('ask-sdk-core');
const axios = require('axios');

// Manipulador para a solicitação de lançamento (quando a skill é iniciada)
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

// Traduções para os tipos de Pokémon
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

// Manipulador para a solicitação de GetSorteioPokemonIntent (quando o usuário solicita um Pokémon aleatório)
const GetSorteioPokemonIntentHandler = {
    canHandle (handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetSorteioPokemonIntent';
    },
    async handle(handlerInput) {
        try {
            // Obter os atributos da sessão
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

            // Verificar se o usuário já capturou um Pokémon
            if (sessionAttributes.captured) {
                const speakOutput = `Você já tem ${sessionAttributes.pokemonName} como seu Pokémon inicial. Não é possível capturar outro. Fale "Modo batalha" para iniciar sua jornada ao lado de ${sessionAttributes.pokemonName}  `
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt(speakOutput)
                    .getResponse();
            }

            // Obter uma lista de Pokémons
            const response = await axios.get('https://pokeapi.co/api/v2/pokemon?offset=0&limit=151');
            const pokemons = response.data.results;

            // Escolher um Pokémon aleatório
            const randomPokemonIndex = Math.floor(Math.random() * 151);
            const randomPokemon = pokemons[randomPokemonIndex];
            sessionAttributes.pokemonName = randomPokemon.name;
            const pokemonName = randomPokemon.name;

            const pokemonUrl = randomPokemon.url;

            // Obter informações do Pokémon selecionado
            const pokemonResponse = await axios.get(pokemonUrl);
            const types = pokemonResponse.data.types;
            const typeNames = types.map(type => typeTranslations[type.type.name]);

            // Gerar uma chance de captura aleatória
            const randomNumber1 = Math.floor(Math.random() * 101);

            // Mensagem de saída com informações do Pokémon e chance de captura
            const speakOutput = `O Pokémon Encontrado foi: ${pokemonName}! É do tipo ${typeNames.join(' e ')}. A chance de captura é de ${randomNumber1}%. Você gostaria de tentar capturar este Pokémon?`;

            // Atualizar os atributos da sessão
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

// Manipulador para a solicitação de CapturePokemonIntent (quando o usuário tenta capturar um Pokémon)
const CapturePokemonIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CapturePokemonIntent';
    },
    
    handle(handlerInput) {
        try {
            // Obter os atributos da sessão
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            const { pokemonName, randomNumber1, captured } = sessionAttributes;
            let speakOutput = "";
            const randomNumber2 = Math.floor(Math.random() * 101); 
          
        if (randomNumber1 >= randomNumber2) {
                // Se a captura for bem-sucedida, atualizar os atributos da sessão
                speakOutput = `Parabéns! Você capturou o Pokémon ${pokemonName}. Fale "Modo batalha" para iniciar sua jornada ao lado de ${pokemonName}`;
                sessionAttributes.captured = true;
            } else {
                // Se a captura falhar, gerar uma mensagem de saída de falha
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

            // Atualizar os atributos da sessão
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
    }
};


// Manipulador para a solicitação de TentarNovamenteIntent (quando o usuário quer tentar capturar novamente)
const TentarNovamenteIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TentarNovamenteIntent';
    },
    async handle(handlerInput) {
        try {
            // Obter os atributos da sessão
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            
            // Verificar se o usuário já capturou um Pokémon
            if (sessionAttributes.captured) {
                return handlerInput.responseBuilder
                    .speak('Você já capturou um Pokémon. Não é possível tentar novamente.')
                    .getResponse();
            }

            // Chamar o manipulador GetSorteioPokemonIntentHandler para obter um novo Pokémon para capturar
            const response = await GetSorteioPokemonIntentHandler.handle(handlerInput);
            
            // Retornar a resposta com a mensagem de saída e reprompt
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

// Manipulador para a solicitação de ModoBatalhaIntent (quando o usuário solicita o modo de batalha)
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


// Configuração e exportação do manipulador principal da skill
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        GetSorteioPokemonIntentHandler, // Manipulador para a solicitação de sorteio de Pokémon
        CapturePokemonIntentHandler,     // Manipulador para a solicitação de captura de Pokémon
        TentarNovamenteIntentHandler,    // Manipulador para a solicitação de tentar capturar novamente
        ModoBatalhaIntentHandler         // Manipulador para a solicitação de iniciar o modo de batalha
    )
    .lambda(); // Exporta a skill como uma função Lambda para uso na plataforma da Alexa


const HelpIntentHandler = {
    // Verifica se a solicitação é do tipo 'IntentRequest' e se o nome da intenção é 'AMAZON.HelpIntent'
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    // Lida com a solicitação de ajuda
    handle(handlerInput) {
        // Define a mensagem de saudação e ajuda
        const speakOutput = 'Você pode dizer olá para mim! Como posso ajudar?';

        // Constrói e retorna a resposta da skill com a mensagem de saudação/ajuda
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput) // Define a mensagem de reprompt igual à saudação
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    // Verifica se a solicitação é do tipo 'IntentRequest' e se o nome da intenção é 'AMAZON.CancelIntent' ou 'AMAZON.StopIntent'
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    // Lida com a solicitação de cancelamento ou encerramento da interação
    handle(handlerInput) {
        // Define a mensagem de despedida
        const speakOutput = 'Adeus treinador!';

        // Constrói e retorna a resposta da skill com a mensagem de despedida
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    // Verifica se a solicitação é do tipo 'IntentRequest' e se o nome da intenção é 'AMAZON.FallbackIntent'
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    // Lida com a solicitação de fallback (quando a skill não entende a intenção do usuário)
    handle(handlerInput) {
        // Define a mensagem de resposta padrão para quando a skill não entende a intenção
        const speakOutput = 'Não entendi sua Intent.';

        // Constrói e retorna a resposta da skill com a mensagem de fallback
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput) // Define a mensagem de reprompt igual à mensagem de fallback
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    // Verifica se a solicitação é do tipo 'SessionEndedRequest'
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    // Lida com o encerramento da sessão (geralmente usado para lógica de limpeza)
    handle(handlerInput) {
        // Registra informações de encerramento da sessão no console
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        
        // Qualquer lógica de limpeza ou encerramento pode ser realizada aqui
        
        // Retorna uma resposta vazia, pois não há uma interação ativa para responder
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

const IntentReflectorHandler = {
    // Verifica se a solicitação é do tipo 'IntentRequest'
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    // Lida com a solicitação de reflexão de intenção, que reflete a intenção do usuário
    handle(handlerInput) {
        // Obtém o nome da intenção que o usuário acionou
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        // Gera uma mensagem de saída que reflete a intenção do usuário
        const speakOutput = `Você acionou ${intentName}`;

        // Constrói e retorna a resposta da skill com a mensagem de reflexão
        return handlerInput.responseBuilder
            .speak(speakOutput)
            // Você pode adicionar uma mensagem de reprompt aqui se desejar manter a sessão aberta
            .getResponse();
    }
};

const ErrorHandler = {
    // Este manipulador lida com qualquer tipo de solicitação, pois pode tratar erros genéricos
    canHandle() {
        return true;
    },
    // Lida com erros genéricos e fornece uma mensagem de erro padrão ao usuário
    handle(handlerInput, error) {
        // Define uma mensagem de saída de erro padrão
        const speakOutput = 'Desculpe, tive problemas para fazer o que você pediu. Por favor, tente novamente.';
        // Registra o erro no console para fins de depuração
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        // Constrói e retorna a resposta da skill com a mensagem de erro
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput) // Pode adicionar uma mensagem de reprompt se desejar
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        // Adiciona manipuladores de solicitação (handlers) para diferentes tipos de intenções ou ações do usuário
        LaunchRequestHandler, // Manipulador para o início da skill
        GetSorteioPokemonIntentHandler, // Manipulador para a intenção de sorteio de Pokémon
        HelpIntentHandler, // Manipulador para a intenção de ajuda
        ModoBatalhaIntentHandler, // Manipulador para a intenção do modo de batalha
        TentarNovamenteIntentHandler, // Manipulador para a intenção de tentar novamente
        CapturePokemonIntentHandler, // Manipulador para a intenção de captura de Pokémon
        CancelAndStopIntentHandler, // Manipulador para as intenções de cancelar ou parar
        FallbackIntentHandler, // Manipulador para a intenção de fallback (quando a skill não entende a ação)
        SessionEndedRequestHandler, // Manipulador para o encerramento da sessão
        IntentReflectorHandler // Manipulador para refletir a intenção do usuário
    )
    .addErrorHandlers(
        ErrorHandler) // Adiciona manipulador de erro genérico
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();
