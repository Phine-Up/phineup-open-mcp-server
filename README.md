# Phineup Open MCP Server

Production-ready MCP (Model Context Protocol) server with advanced tooling capabilities, comprehensive logging, and robust error handling.

## 🚀 Features

- **MCP Protocol Support**: Full implementation of Model Context Protocol
- **Tool Management**: Dynamic tool registration and execution
- **Advanced Logging**: Winston-based logging with file and console output
- **Error Handling**: Comprehensive error handling and graceful shutdown
- **Type Safety**: Full TypeScript support with strict type checking
- **Production Ready**: Environment configuration, process management, and monitoring

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- pnpm package manager

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd phineup-open-mcp-server
```

2. Install dependencies:
```bash
pnpm install
```

3. Create environment file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## 🏃‍♂️ Usage

### Development Mode
```bash
pnpm dev
```

### Production Mode
```bash
pnpm build
pnpm start
```

### Available Scripts
- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build production bundle
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues

## 🛠️ Built-in Tools

### 1. Echo Tool
- **Name**: `echo`
- **Description**: Echoes back the input text
- **Parameters**: `{ text: string }`

### 2. Calculator Tool
- **Name**: `calculate`
- **Description**: Performs basic mathematical operations
- **Parameters**: `{ operation: 'add'|'subtract'|'multiply'|'divide', a: number, b: number }`

### 3. System Info Tool
- **Name**: `system_info`
- **Description**: Returns system information
- **Parameters**: `{}`

## 🔧 Adding Custom Tools

```typescript
import { z } from 'zod';

// Register a new tool
mcpServer.registerTool(
  'custom_tool',
  'Description of your tool',
  z.object({
    // Define your input schema
    param1: z.string().describe('Parameter description'),
    param2: z.number().describe('Another parameter'),
  }),
  async (args) => {
    // Your tool logic here
    return { result: 'success' };
  }
);
```

## 📁 Project Structure

```
phineup-open-mcp-server/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                 # Compiled JavaScript output
├── logs/                 # Log files
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## 🔍 Logging

The server uses Winston for comprehensive logging:

- **Console**: Colored, formatted logs for development
- **File Logs**: 
  - `logs/combined.log` - All log levels
  - `logs/error.log` - Error level only

### Log Levels
- `error` - Error messages
- `warn` - Warning messages  
- `info` - Informational messages
- `debug` - Debug information

## 🚨 Error Handling

- Comprehensive error catching and logging
- Graceful shutdown on SIGINT/SIGTERM
- Process exit codes for different error scenarios
- Tool execution error isolation

## 🔒 Security Features

- Input validation using Zod schemas
- Error message sanitization
- Rate limiting support (configurable)
- CORS configuration options

## 📊 Monitoring

- Process uptime tracking
- Memory usage monitoring
- Tool execution statistics
- Health check endpoints

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

For issues and questions, please open an issue in the repository.
