"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLLMProvider = getLLMProvider;
const openai_1 = require("@ai-sdk/openai");
const anthropic_1 = require("@ai-sdk/anthropic");
const google_1 = require("@ai-sdk/google");
const ollama_ai_provider_1 = require("ollama-ai-provider");
function getLLMProvider(modelConfig) {
    switch (modelConfig.provider) {
        case 'openai': {
            const openai = (0, openai_1.createOpenAI)({
                apiKey: modelConfig.api_key || process.env.OPENAI_API_KEY,
                baseURL: modelConfig.base_url, // Useful for OpenAI-compatible endpoints like LM Studio
            });
            return openai(modelConfig.model_id);
        }
        case 'anthropic': {
            const anthropic = (0, anthropic_1.createAnthropic)({
                apiKey: modelConfig.api_key || process.env.ANTHROPIC_API_KEY,
                baseURL: modelConfig.base_url,
            });
            return anthropic(modelConfig.model_id);
        }
        case 'google': {
            const google = (0, google_1.createGoogleGenerativeAI)({
                apiKey: modelConfig.api_key || process.env.GEMINI_API_KEY,
                baseURL: modelConfig.base_url,
            });
            return google(modelConfig.model_id);
        }
        case 'ollama': {
            const ollama = (0, ollama_ai_provider_1.createOllama)({
                baseURL: (modelConfig.base_url || 'http://127.0.0.1:11434') + '/api',
            });
            return ollama(modelConfig.model_id);
        }
        default:
            throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
}
