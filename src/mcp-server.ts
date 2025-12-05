#!/usr/bin/env node
/**
 * Calculator MCP Server
 * Provides basic calculator operations via MCP protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Calculator Server with stdio transport
 */
class CalculatorServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'calculator-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers() {
        // List available calculator tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'add',
                    description: 'Add two numbers together',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            a: {
                                type: 'number',
                                description: 'First number',
                            },
                            b: {
                                type: 'number',
                                description: 'Second number',
                            },
                        },
                        required: ['a', 'b'],
                    },
                },
                {
                    name: 'subtract',
                    description: 'Subtract second number from first number',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            a: {
                                type: 'number',
                                description: 'First number',
                            },
                            b: {
                                type: 'number',
                                description: 'Second number',
                            },
                        },
                        required: ['a', 'b'],
                    },
                },
                {
                    name: 'multiply',
                    description: 'Multiply two numbers together',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            a: {
                                type: 'number',
                                description: 'First number',
                            },
                            b: {
                                type: 'number',
                                description: 'Second number',
                            },
                        },
                        required: ['a', 'b'],
                    },
                },
                {
                    name: 'divide',
                    description: 'Divide first number by second number',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            a: {
                                type: 'number',
                                description: 'Numerator',
                            },
                            b: {
                                type: 'number',
                                description: 'Denominator',
                            },
                        },
                        required: ['a', 'b'],
                    },
                },
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                const a = args.a as number;
                const b = args.b as number;
                let result: number;

                switch (name) {
                    case 'add':
                        result = this.add(a, b);
                        break;

                    case 'subtract':
                        result = this.subtract(a, b);
                        break;

                    case 'multiply':
                        result = this.multiply(a, b);
                        break;

                    case 'divide':
                        result = this.divide(a, b);
                        break;

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Result: ${result}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        });
    }

    /**
     * Add two numbers
     */
    private add(a: number, b: number): number {
        return a + b;
    }

    /**
     * Subtract second number from first
     */
    private subtract(a: number, b: number): number {
        return a - b;
    }

    /**
     * Multiply two numbers
     */
    private multiply(a: number, b: number): number {
        return a * b;
    }

    /**
     * Divide first number by second
     */
    private divide(a: number, b: number): number {
        if (b === 0) {
            throw new Error('Division by zero is not allowed');
        }
        return a / b;
    }

    /**
     * Start the server with stdio transport
     */
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Calculator MCP Server running on stdio');
    }
}

// Start server
const server = new CalculatorServer();
server.run().catch(console.error);
