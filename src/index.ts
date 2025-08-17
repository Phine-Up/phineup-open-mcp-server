import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createLogger, format, transports } from 'winston';
import { config } from 'dotenv';

// Environment configuration
config();

// Logger configuration
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// MCP Server implementation
class PhineupMCPServer {
  private server: Server;
  private tools: Map<string, any> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'phineup-open-mcp-server',
        version: '1.0.0',
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.info('Listing available tools');
      
      const tools = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return {
        tools,
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info(`Calling tool: ${name}`, { args });
      
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Tool '${name}' not found`);
      }

      try {
        const result = await tool.handler(args);
        logger.info(`Tool ${name} executed successfully`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}:`, error);
        throw error;
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      logger.error('MCP Server error:', error);
    };
  }

  // Tool registration method
  public registerTool(name: string, description: string, inputSchema: any, handler: Function) {
    this.tools.set(name, {
      name,
      description,
      inputSchema,
      handler,
    });
    logger.info(`Tool registered: ${name}`);
  }

  // Initialize default tools
  private initializeDefaultTools() {
    // Example tool: Echo
    this.registerTool(
      'echo',
      'Echoes back the input text',
      z.object({
        text: z.string().describe('Text to echo back'),
      }),
      async (args: any) => {
        return { echoed: args.text };
      }
    );

    // Example tool: Math operations
    this.registerTool(
      'calculate',
      'Performs basic mathematical operations',
      z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Mathematical operation'),
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      }),
      async (args: any) => {
        const { operation, a, b } = args;
        let result: number;

        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            if (b === 0) throw new Error('Division by zero');
            result = a / b;
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return { result, operation, a, b };
      }
    );

    // Example tool: System info
    this.registerTool(
      'system_info',
      'Returns system information',
      z.object({}),
      async () => {
        return {
          platform: process.platform,
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        };
      }
    );
  }

  public async start() {
    try {
      this.initializeDefaultTools();
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('🚀 Phineup MCP Server started successfully');
      logger.info(`📊 Registered ${this.tools.size} tools`);
      
      // Graceful shutdown handling
      process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        this.shutdown();
      });

      process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        this.shutdown();
      });

    } catch (error) {
      logger.error('Failed to start MCP server:', error);
      process.exit(1);
    }
  }

  private async shutdown() {
    try {
      await this.server.close();
      logger.info('MCP Server shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  try {
    const mcpServer = new PhineupMCPServer();
    await mcpServer.start();
  } catch (error) {
    logger.error('Fatal error in main:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export { PhineupMCPServer };
