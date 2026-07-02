import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { LanguageModelV1 } from 'ai';
import { ModelConfig } from './config';

export function getLLMProvider(modelConfig: ModelConfig): LanguageModelV1 {
  switch (modelConfig.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: modelConfig.api_key || process.env.OPENAI_API_KEY,
        baseURL: modelConfig.base_url, // Useful for OpenAI-compatible endpoints like LM Studio
      });
      return openai(modelConfig.model_id);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: modelConfig.api_key || process.env.ANTHROPIC_API_KEY,
        baseURL: modelConfig.base_url,
      });
      return anthropic(modelConfig.model_id);
    }

    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: modelConfig.api_key || process.env.GEMINI_API_KEY,
        baseURL: modelConfig.base_url,
      });
      return google(modelConfig.model_id);
    }

    case 'ollama': {
      const ollama = createOllama({
        baseURL: (modelConfig.base_url || 'http://127.0.0.1:11434') + '/api',
      });
      return ollama(modelConfig.model_id);
    }

    default:
      throw new Error(`Unsupported provider: ${modelConfig.provider}`);
  }
}
