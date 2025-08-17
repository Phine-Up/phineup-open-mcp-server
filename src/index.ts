import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createLogger, format, transports } from "winston";
import { config } from "dotenv";
import sharp from "sharp";
import CloudConvert from "cloudconvert";
import tinify from "tinify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Environment configuration
config();

// API Keys
const TINY_PNG_API_KEY = process.env.TINY_PNG_API_KEY;
const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY;

// Logger configuration
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
    new transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

// Initialize CloudConvert
const cloudConvert = new CloudConvert(CLOUDCONVERT_API_KEY || "");

// Initialize TinyPNG
if (TINY_PNG_API_KEY) {
  tinify.key = TINY_PNG_API_KEY;
  logger.info("TinyPNG API key configured");
} else {
  logger.warn("TinyPNG API key not found, using Sharp fallback");
}

// Create MCP server instance
const server = new McpServer({
  name: "phineup-mcp-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Helper function for image compression
async function compressImage(
  base64Data: string,
  quality: number,
  format: string,
  maxWidth?: number,
  maxHeight?: number
) {
  try {
    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    let compressedBuffer: Buffer | undefined;
    let compressionMethod = "sharp";

    // Try TinyPNG first if API key is available and format is supported
    if (TINY_PNG_API_KEY && (format === "jpeg" || format === "png")) {
      try {
        logger.info("Attempting TinyPNG compression");
        const source = tinify.fromBuffer(buffer);

        // Resize if dimensions specified
        if (maxWidth || maxHeight) {
          source.resize({
            method: "fit",
            width: maxWidth,
            height: maxHeight,
          });
        }

        compressedBuffer = Buffer.from(await source.toBuffer());
        compressionMethod = "tinypng";
        logger.info("TinyPNG compression successful");
      } catch (tinifyError) {
        logger.warn(
          "TinyPNG compression failed, falling back to Sharp:",
          tinifyError
        );
        // Fallback to Sharp
      }
    }

    // Use Sharp if TinyPNG failed or not available
    if (!compressedBuffer) {
      logger.info("Using Sharp compression");
      let sharpInstance = sharp(buffer);

      // Resize if dimensions specified
      if (maxWidth || maxHeight) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      // Apply compression based on format
      switch (format) {
        case "jpeg":
          compressedBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
          break;
        case "png":
          compressedBuffer = await sharpInstance
            .png({ compressionLevel: Math.floor((100 - quality) / 10) })
            .toBuffer();
          break;
        case "webp":
          compressedBuffer = await sharpInstance.webp({ quality }).toBuffer();
          break;
        case "avif":
          compressedBuffer = await sharpInstance.avif({ quality }).toBuffer();
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    }

    const compressedBase64 = compressedBuffer.toString("base64");
    const originalSize = buffer.length;
    const compressedSize = compressedBuffer.length;
    const compressionRatio = (
      ((originalSize - compressedSize) / originalSize) *
      100
    ).toFixed(2);

    return {
      success: true,
      compressedData: compressedBase64,
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio}%`,
      format,
      quality,
      compressionMethod,
      mimeType: `image/${format}`,
      message: `Image compressed successfully using ${compressionMethod}. Size reduced by ${compressionRatio}%`,
    };
  } catch (error) {
    logger.error("Image compression error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Image compression failed: ${errorMessage}`);
  }
}

// Helper function for CloudConvert conversion
async function convertWithCloudConvert(
  base64Data: string,
  inputFormat: string,
  outputFormat: string,
  quality: number,
  options?: any
) {
  try {
    if (!CLOUDCONVERT_API_KEY) {
      throw new Error("CloudConvert API key not configured");
    }

    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    // Create unique filename
    const inputFilename = `input_${uuidv4()}.${inputFormat}`;
    const tempDir = path.join(process.cwd(), "temp");
    
    // Ensure temp directory exists
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    
    const inputPath = path.join(tempDir, inputFilename);

    // Write input file
    await fs.writeFile(inputPath, buffer);

    logger.info(
      `Starting CloudConvert conversion: ${inputFormat} -> ${outputFormat}`
    );

    // For now, return a placeholder response
    // TODO: Implement actual CloudConvert API integration
    logger.info(
      `CloudConvert conversion requested: ${inputFormat} -> ${outputFormat}`
    );

    // Simulate conversion delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Cleanup temp file
    await fs.unlink(inputPath).catch(() => {});

    // Return original data for now
    return {
      success: true,
      convertedData: base64Data,
      downloadUrl: null,
      originalFormat: inputFormat,
      outputFormat,
      quality,
      originalSize: buffer.length,
      convertedSize: buffer.length,
      message: `CloudConvert conversion placeholder - ${inputFormat} to ${outputFormat}`,
      jobId: `placeholder_${uuidv4()}`,
      note: "CloudConvert API integration pending - currently returns original data",
    };
  } catch (error) {
    logger.error("CloudConvert error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`CloudConvert conversion failed: ${errorMessage}`);
  }
}

// Register media compression tool
server.tool(
  "compress_media",
  "Compresses image or video media files with configurable quality settings",
  {
    mediaData: z.string().describe("Base64 encoded media data"),
    mediaType: z.enum(["image", "video"]).describe("Type of media to compress"),
    quality: z.number().min(1).max(100).default(80).describe("Compression quality (1-100)"),
    format: z.enum(["jpeg", "png", "webp", "avif"]).default("jpeg").describe("Output format for images"),
    maxWidth: z.number().optional().describe("Maximum width for resizing"),
    maxHeight: z.number().optional().describe("Maximum height for resizing"),
  },
  async ({ mediaData, mediaType, quality, format, maxWidth, maxHeight }) => {
    try {
      if (mediaType === "image") {
        const result = await compressImage(
          mediaData,
          quality,
          format,
          maxWidth,
          maxHeight
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } else if (mediaType === "video") {
        // For video compression, we'll use CloudConvert as it's more reliable
        throw new Error(
          "Video compression not yet implemented. Use convert_media tool instead."
        );
      } else {
        throw new Error(`Unsupported media type: ${mediaType}`);
      }
    } catch (error) {
      logger.error("Media compression error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Media compression failed: ${errorMessage}`);
    }
  }
);

// Register media conversion tool
server.tool(
  "convert_media",
  "Converts media files using CloudConvert API with support for various input/output formats",
  {
    mediaData: z.string().describe("Base64 encoded media data"),
    inputFormat: z.string().describe("Input format (e.g., jpg, png, mp4, avi)"),
    outputFormat: z.string().describe("Output format (e.g., webp, avif, mp4, mov)"),
    quality: z.number().min(1).max(100).default(80).describe("Conversion quality (1-100)"),
    options: z.object({
      width: z.number().optional().describe("Target width"),
      height: z.number().optional().describe("Target height"),
      fps: z.number().optional().describe("Target FPS for videos"),
      bitrate: z.string().optional().describe("Target bitrate for videos"),
    }).optional().describe("Additional conversion options"),
  },
  async ({ mediaData, inputFormat, outputFormat, quality, options }) => {
    try {
      const result = await convertWithCloudConvert(
        mediaData,
        inputFormat,
        outputFormat,
        quality,
        options
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("CloudConvert conversion error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Media conversion failed: ${errorMessage}`);
    }
  }
);

// Main function to run the server
async function main() {
  try {
    // Create HTTP transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => uuidv4(),
    });

    // Connect server to transport
    await server.connect(transport);

    // Create HTTP server
    const http = await import("http");
    const port = process.env.PORT || 3000;
    
    const httpServer = http.createServer(async (req, res) => {
      try {
        // Handle MCP requests
        if (req.url === "/mcp" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk.toString();
          });
          
          req.on("end", async () => {
            try {
              const jsonBody = JSON.parse(body);
              await transport.handleRequest(req, res, jsonBody);
            } catch (error) {
              logger.error("Error handling MCP request:", error);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
        }
      } catch (error) {
        logger.error("HTTP server error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });

    // Start HTTP server
    httpServer.listen(port, () => {
      logger.info("🚀 Phineup MCP Server started successfully with StreamableHTTPServerTransport");
      logger.info(`📊 Server running on port ${port}`);
      logger.info("Server is now running. Press Ctrl+C to stop.");
    });

    // Graceful shutdown handling
    process.on("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      httpServer.close(() => {
        shutdown();
      });
    });

    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      httpServer.close(() => {
        shutdown();
      });
    });

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    logger.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    // Cleanup temp directory
    try {
      const tempDir = path.join(process.cwd(), "temp");
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.info("Temp directory cleaned up");
    } catch (error) {
      logger.warn("Failed to cleanup temp directory:", error);
    }

    logger.info("MCP Server shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Unhandled error in main:", error);
    process.exit(1);
  });
}

logger.addListener("error", (error) => {
  console.error("Error:", error);
});

logger.addListener("info", (info) => {
  console.log("Info:", info);
});

logger.addListener("warn", (warn) => {
  console.warn("Warn:", warn);
});

logger.addListener("debug", (debug) => {
  console.debug("Debug:", debug);
});