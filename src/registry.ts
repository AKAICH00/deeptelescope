import { ModelConfig } from './cli-manager';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('./agents.config.json');

/**
 * Agent configurations loaded from agents.config.json
 */
export const REGISTRY: Record<string, ModelConfig> =
    config as Record<string, ModelConfig>;
