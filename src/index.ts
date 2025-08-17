import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createLogger, format, transports } from 'winston';
import { config } from 'dotenv';
import sharp from 'sharp';
import CloudConvert from 'cloudconvert';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

// Initialize CloudConvert
const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY || '');

// MCP Server implementation
class PhineupMCPServer {
  private server: Server;
  private tools: Map<string, any> = new Map();
  private tempDir: string;

  constructor() {
    this.server = new Server(
      {
        name: 'phineup-open-mcp-server',
        version: '1.0.0',
      }
    );

    this.tempDir = path.join(process.cwd(), 'temp');
    this.setupToolHandlers();
    this.setupErrorHandling();
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info('Created temp directory');
    }
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

  // Initialize production tools
  private initializeProductionTools() {
    // Media Compression Tool
    this.registerTool(
      'compress_media',
      'Compresses image or video media files with configurable quality settings',
      z.object({
        mediaData: z.string().describe('Base64 encoded media data'),
        mediaType: z.enum(['image', 'video']).describe('Type of media to compress'),
        quality: z.number().min(1).max(100).default(80).describe('Compression quality (1-100)'),
        format: z.enum(['jpeg', 'png', 'webp', 'avif']).default('jpeg').describe('Output format for images'),
        maxWidth: z.number().optional().describe('Maximum width for resizing'),
        maxHeight: z.number().optional().describe('Maximum height for resizing'),
      }),
      async (args: any) => {
        const { mediaData, mediaType, quality, format, maxWidth, maxHeight } = args;
        
        try {
          if (mediaType === 'image') {
            return await this.compressImage(mediaData, quality, format, maxWidth, maxHeight);
          } else if (mediaType === 'video') {
            return await this.compressVideo(mediaData, quality);
          } else {
            throw new Error(`Unsupported media type: ${mediaType}`);
          }
        } catch (error) {
          logger.error('Media compression error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Media compression failed: ${errorMessage}`);
        }
      }
    );

    // CloudConvert Tool
    this.registerTool(
      'convert_media',
      'Converts media files using CloudConvert API with support for various input/output formats',
      z.object({
        mediaData: z.string().describe('Base64 encoded media data'),
        inputFormat: z.string().describe('Input format (e.g., jpg, png, mp4, avi)'),
        outputFormat: z.string().describe('Output format (e.g., webp, avif, mp4, mov)'),
        quality: z.number().min(1).max(100).default(80).describe('Conversion quality (1-100)'),
        options: z.object({
          width: z.number().optional().describe('Target width'),
          height: z.number().optional().describe('Target height'),
          fps: z.number().optional().describe('Target FPS for videos'),
          bitrate: z.string().optional().describe('Target bitrate for videos'),
        }).optional().describe('Additional conversion options'),
      }),
      async (args: any) => {
        const { mediaData, inputFormat, outputFormat, quality, options } = args;
        
        try {
          return await this.convertWithCloudConvert(mediaData, inputFormat, outputFormat, quality, options);
        } catch (error) {
          logger.error('CloudConvert conversion error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Media conversion failed: ${errorMessage}`);
        }
      }
    );
  }

  // Image compression implementation
  private async compressImage(base64Data: string, quality: number, format: string, maxWidth?: number, maxHeight?: number) {
    try {
      // Remove data URL prefix if present
      const base64Clean = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      
      let sharpInstance = sharp(buffer);
      
      // Resize if dimensions specified
      if (maxWidth || maxHeight) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Apply compression based on format
      let compressedBuffer: Buffer;
      switch (format) {
        case 'jpeg':
          compressedBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
          break;
        case 'png':
          compressedBuffer = await sharpInstance.png({ compressionLevel: Math.floor((100 - quality) / 10) }).toBuffer();
          break;
        case 'webp':
          compressedBuffer = await sharpInstance.webp({ quality }).toBuffer();
          break;
        case 'avif':
          compressedBuffer = await sharpInstance.avif({ quality }).toBuffer();
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
      
      const compressedBase64 = compressedBuffer.toString('base64');
      const originalSize = buffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
      
      return {
        success: true,
        compressedData: compressedBase64,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        format,
        quality,
        mimeType: `image/${format}`,
        message: `Image compressed successfully. Size reduced by ${compressionRatio}%`
      };
      
    } catch (error) {
      logger.error('Image compression error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Image compression failed: ${errorMessage}`);
    }
  }

  // Video compression implementation (basic)
  private async compressVideo(base64Data: string, quality: number) {
    // For video compression, we'll use CloudConvert as it's more reliable
    // This is a placeholder for future implementation
    throw new Error('Video compression not yet implemented. Use convert_media tool instead.');
  }

  // CloudConvert implementation
  private async convertWithCloudConvert(base64Data: string, inputFormat: string, outputFormat: string, quality: number, options?: any) {
    try {
      // Remove data URL prefix if present
      const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');
      
      // Create unique filename
      const inputFilename = `input_${uuidv4()}.${inputFormat}`;
      const inputPath = path.join(this.tempDir, inputFilename);
      
      // Write input file
      await fs.writeFile(inputPath, buffer);
      
      // For now, return a placeholder response
      // TODO: Implement actual CloudConvert API integration
      logger.info(`CloudConvert conversion requested: ${inputFormat} -> ${outputFormat}`);
      
      // Cleanup temp file
      await fs.unlink(inputPath).catch(() => {});
      
      return {
        success: true,
        convertedData: base64Data, // Return original for now
        downloadUrl: null,
        originalFormat: inputFormat,
        outputFormat,
        quality,
        originalSize: buffer.length,
        convertedSize: buffer.length,
        message: `CloudConvert conversion placeholder - ${inputFormat} to ${outputFormat}`,
        jobId: `placeholder_${uuidv4()}`,
        note: 'CloudConvert API integration pending - currently returns original data'
      };
      
    } catch (error) {
      logger.error('CloudConvert error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`CloudConvert conversion failed: ${errorMessage}`);
    }
  }

  public async start() {
    try {
      this.initializeProductionTools();
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('🚀 Phineup MCP Server started successfully');
      logger.info(`📊 Registered ${this.tools.size} production tools`);
      
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
      
      // Cleanup temp directory
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
        logger.info('Temp directory cleaned up');
      } catch (error) {
        logger.warn('Failed to cleanup temp directory:', error);
      }
      
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
