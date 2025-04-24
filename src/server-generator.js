/**
 * Generate the main server.js file with fixes for MCP compatibility
 */
function generateServerFile(config, spec, toolMap, securitySchemes) {
    console.log('Generating server.js file...');
    const toolsArray = Object.values(toolMap);
    const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;

    // Create JavaScript version with fixes for MCP compatibility
    const serverCode = `#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { config as dotenvConfig } from "dotenv";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializedNotificationSchema,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dotenvPath = path.resolve(__dirname, ".env");

dotenvConfig({ path: dotenvPath });

// Define tool schemas
const TOOLS = ${JSON.stringify(toolsArray, null, 2)};
const SECURITY_SCHEMES = ${JSON.stringify(securitySchemes, null, 2)};

/**
 * MCP Server for ${spec.info?.title || 'OpenAPI'} API
 * Generated from OpenAPI spec version ${spec.info?.version || 'unknown'}
 * Generated on ${new Date().toISOString()}
 */
class MCPServer {
  constructor() {
    // Initialize class properties
    this.server = null;
    this.isConnected = false;
    this.tools = new Map();
    this.debug = process.env.DEBUG === "true";
    this.baseUrl = process.env.API_BASE_URL || "";
    this.headers = this.parseHeaders(process.env.API_HEADERS || "");

    // Initialize tools map - do this before creating server
    this.initializeTools();

    // Create MCP server with correct capabilities
    this.server = new Server(
      {
        name: process.env.SERVER_NAME || "${config.name}",
        version: process.env.SERVER_VERSION || "${config.version}",
      },
      {
        capabilities: {
          tools: {}, // Enable tools capability
          logging: {}, //Enable logging capability
        },
      }
    );

    // Set up request handlers - don't log here
    this.setupHandlers();
  }

  /**
   * Parse headers from string
   */
  parseHeaders(headerStr) {
    const headers = {};
    if (headerStr) {
      headerStr.split(",").forEach((header) => {
        const [key, value] = header.split(":");
        if (key && value) headers[key.trim()] = value.trim();
      });
    }
    return headers;
  }

  /**
   * Initialize tools map from OpenAPI spec
   * This runs before the server is connected, so don't log here
   */
  initializeTools() {
    // Initialize each tool in the tools map
    for (const tool of TOOLS) {
      this.tools.set(tool.id, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        // Don't include security at the tool level
      });
    }

    // Don't log here, we're not connected yet
    this.log('info', \`Initialized \${this.tools.size} tools\`);
  }

  /**
   * Set up request handlers
   */
  setupHandlers() {
    this.server.setNotificationHandler(InitializedNotificationSchema, async (request) => {
      this.log('debug', "Handling notifications/initialized request");
      // mark isConnected is True
      this.isConnected = true
    });
    this.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      this.log('debug', "Handling logging/setLevel request");
      // mark isConnected is True
      this.debug = request.params.level == "debug"
    });
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log('debug', "Handling ListTools request");
      // Return tools in the format expected by MCP SDK
      return {
        tools: Array.from(this.tools.entries()).map(([id, tool]) => ({
          id,
          ...tool,
        })),
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { id, name, arguments: params } = request.params;
      this.log('debug', "Handling CallTool request", { id, name, params });

      let toolId;
      let toolDetails;

      try {
        // Find the requested tool
        toolId = id;
        if (!toolId && name) {
          for (const [tid, tool] of this.tools.entries()) {
            if (tool.name === name) {
              toolId = tid;
              break;
            }
          }
        }

        if (!toolId) {
          throw new Error(\`Tool not found: \${id || name}\`);
        }

        toolDetails = TOOLS.find(t => t.id === toolId);
        if (!toolDetails) {
          throw new Error(\`Tool details not found for ID: \${toolId}\`);
        }

        this.log('info', \`Executing tool: \${toolId}\`);

        // Execute the API call
        const result = await this.executeApiCall(toolDetails, params || {});

        // Return the result in the correct MCP format
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('error', \`Error executing tool \${toolId || name}: \${errorMessage}\`);

        // Format error according to MCP SDK expectations
        return {
          error: {
            message: errorMessage,
            details: error.response?.data
              ? JSON.stringify(error.response.data)
              : undefined
          }
        };
      }
    });
  }

  /**
   * Execute an API call for a tool
   */
  async executeApiCall(tool, params) {
    // Get method and path from tool
    const method = tool.method;
    let path = tool.path;

    // Clone params to avoid modifying the original
    const requestParams = { ...params };

    // Replace path parameters with values from params
    Object.entries(requestParams).forEach(([key, value]) => {
      const placeholder = \`{\${key}}\`;
      if (path.includes(placeholder)) {
        path = path.replace(placeholder, encodeURIComponent(String(value)));
        delete requestParams[key]; // Remove used parameter
      }
    });

    // Build the full URL
    const baseUrl = this.baseUrl.endsWith("/") ? this.baseUrl : \`\${this.baseUrl}/\`;
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(cleanPath, baseUrl).toString();

    this.log('debug', \`API Request: \${method} \${url}\`);

    try {
      // Configure the request
      const config = {
        method: method.toLowerCase(),
        url,
        headers: { ...this.headers },
      };

      // Apply security headers based on tool security requirements
      if (tool.security && Array.isArray(tool.security)) {
        for (const requirement of tool.security) {
          for (const securitySchemeName of Object.keys(requirement)) {
            const securityDefinition = SECURITY_SCHEMES[securitySchemeName];

            if (securityDefinition) {
              const authType = securityDefinition.type;

              // Handle API key
              if (authType === 'apiKey') {
                const apiKeyName = securityDefinition.name;
                const envVarName = \`\${securitySchemeName.toUpperCase()}_\${apiKeyName.toUpperCase()}\`;
                const apiKeyValue = process.env[envVarName];

                if (apiKeyValue) {
                  if (securityDefinition.in === 'header') {
                    config.headers[apiKeyName] = apiKeyValue;
                  } else if (securityDefinition.in === 'query') {
                    config.params = config.params || {};
                    config.params[apiKeyName] = apiKeyValue;
                  }
                } else {
                  this.log('warning', \`API Key environment variable not found: \${envVarName}\`);
                }
              }
              // Handle bearer token
              else if (authType === 'http' && securityDefinition.scheme === 'bearer') {
                const envVarName = \`\${securitySchemeName.toUpperCase()}_BEARERTOKEN\`;
                const bearerToken = process.env[envVarName];

                if (bearerToken) {
                  config.headers['Authorization'] = \`Bearer \${bearerToken}\`;
                } else {
                  this.log('warning', \`Bearer Token environment variable not found: \${envVarName}\`);
                }
              }
              // Handle basic auth
              else if (authType === 'http' && securityDefinition.scheme === 'basic') {
                const username = process.env[\`\${securitySchemeName.toUpperCase()}_USERNAME\`];
                const password = process.env[\`\${securitySchemeName.toUpperCase()}_PASSWORD\`];

                if (username && password) {
                  const auth = Buffer.from(\`\${username}:\${password}\`).toString('base64');
                  config.headers['Authorization'] = \`Basic \${auth}\`;
                } else {
                  this.log('warning', \`Basic auth credentials not found for \${securitySchemeName}\`);
                }
              }
            }
          }
        }
      }

      // Add parameters based on request method
      if (["GET", "DELETE"].includes(method)) {
        // For GET/DELETE, send params as query string
        config.params = { ...(config.params || {}), ...requestParams };
      } else {
        // For POST/PUT/PATCH, send params as JSON body
        config.data = requestParams;
        config.headers["Content-Type"] = "application/json";
      }

      this.log('debug', "Request config:", {
        url: config.url,
        method: config.method,
        params: config.params,
        headers: Object.keys(config.headers)
      });

      // Execute the request
      const response = await axios(config);
      this.log('debug', \`Response status: \${response.status}\`);

      return response.data;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', \`API request failed: \${errorMessage}\`);

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        const responseStatus = error.response?.status;

        this.log('error', 'API Error Details:', {
          status: responseStatus,
          data: typeof responseData === 'object' ? JSON.stringify(responseData) : responseData
        });

        // Rethrow with more context for better error handling
        const detailedError = new Error(\`API request failed with status \${responseStatus}: \${errorMessage}\`);
        detailedError.response = error.response;
        throw detailedError;
      }

      throw error;
    }
  }

  /**
   * Log messages with appropriate level
   * Only sends to MCP if we're connected
   */
  log(level, message, data) {
    // Always log to stderr for visibility
    // Only try to send via MCP if we're in debug mode or it's important
    if (this.debug || level !== 'debug') {
      try {
        // Only send if server exists and is connected
        if (this.server && this.isConnected) {
          this.server.sendLoggingMessage({
            level,
            data: \`[MCP Server] \${message}\${data ? ': ' + JSON.stringify(data) : ''}\`
          });
        }
      } catch (e) {
        // If logging fails, log to stderr
        console.error('Failed to send log via MCP:', e.message);
      }
    }
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Create stdio transport
      const transport = new StdioServerTransport();
      this.log('info', "MCP Server starting on stdio transport");

      // Connect to the transport
      await this.server.connect(transport);

      // Now we can safely log via MCP
      this.log('info', \`MCP Server started successfully with \${this.tools.size} tools\`);
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      process.exit(1);
    }
  }
}

// Start the server
async function main() {
  try {
    const server = new MCPServer();
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
`;

  return serverCode;
}

/**
 * Generate server.ts for TypeScript support with MCP compatibility fixes
 */
function generateServerTS(config, spec, toolMap, securitySchemes) {
  console.log('Generating server.ts file...');
  const toolsArray = Object.values(toolMap);
  const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;

  const serverCode = `#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios, { AxiosRequestConfig, AxiosError } from "axios";
import { config as dotenvConfig } from "dotenv";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  JsonSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Load environment variables
dotenvConfig();

// Define tool and security scheme types
interface OpenApiTool extends Tool {
  method: string;
  path: string;
  security: any[];
}

interface SecurityScheme {
  type: string;
  name?: string;
  in?: string;
  scheme?: string;
}

// Define tool schemas
const TOOLS: OpenApiTool[] = ${JSON.stringify(toolsArray, null, 2)};
const SECURITY_SCHEMES: Record<string, SecurityScheme> = ${JSON.stringify(securitySchemes, null, 2)};

/**
 * MCP Server for ${spec.info?.title || 'OpenAPI'} API
 * Generated from OpenAPI spec version ${spec.info?.version || 'unknown'}
 * Generated on ${new Date().toISOString()}
 */
class MCPServer {
  private server: Server;
  private tools: Map<string, Tool> = new Map();
  private debug: boolean;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    // Initialize properties
    this.debug = process.env.DEBUG === "true";
    this.baseUrl = process.env.API_BASE_URL || "";
    this.headers = this.parseHeaders(process.env.API_HEADERS || "");

    // Initialize tools map - do this before creating server
    this.initializeTools();

    // Create MCP server with correct capabilities
    this.server = new Server(
      {
        name: process.env.SERVER_NAME || "${config.name}",
        version: process.env.SERVER_VERSION || "${config.version}",
      },
      {
        capabilities: {
          tools: true, // Enable tools capability
        },
      }
    );

    // Set up request handlers - don't log here
    this.setupHandlers();
  }

  /**
   * Parse headers from string
   */
  private parseHeaders(headerStr: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (headerStr) {
      headerStr.split(",").forEach((header) => {
        const [key, value] = header.split(":");
        if (key && value) headers[key.trim()] = value.trim();
      });
    }
    return headers;
  }

  /**
   * Initialize tools map from OpenAPI spec
   * This runs before the server is connected, so don't log here
   */
  private initializeTools(): void {
    // Initialize each tool in the tools map
    for (const tool of TOOLS) {
      this.tools.set(tool.id, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as JsonSchema,
        // Don't include security at the tool level
      });
    }

    // Don't log here, we're not connected yet
    console.error(\`Initialized \${this.tools.size} tools\`);
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.log('debug', "Handling ListTools request");
      // Return tools in the format expected by MCP SDK
      return {
        tools: Array.from(this.tools.entries()).map(([id, tool]) => ({
          id,
          ...tool,
        })),
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { id, name, arguments: params } = request.params;
      this.log('debug', "Handling CallTool request", { id, name, params });

      let toolId: string | undefined;
      let toolDetails: OpenApiTool | undefined;

      try {
        // Find the requested tool
        toolId = id;
        if (!toolId && name) {
          for (const [tid, tool] of this.tools.entries()) {
            if (tool.name === name) {
              toolId = tid;
              break;
            }
          }
        }

        if (!toolId) {
          throw new Error(\`Tool not found: \${id || name}\`);
        }

        toolDetails = TOOLS.find(t => t.id === toolId);
        if (!toolDetails) {
          throw new Error(\`Tool details not found for ID: \${toolId}\`);
        }

        this.log('info', \`Executing tool: \${toolId}\`);

        // Execute the API call
        const result = await this.executeApiCall(toolDetails, params || {});

        // Return the result in correct MCP format
        return {
          content: [
            {
              type: "application/json",
              data: result
            }
          ]
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('error', \`Error executing tool \${toolId || name}: \${errorMessage}\`);

        // Format error according to MCP SDK expectations
        return {
          error: {
            message: errorMessage,
            details: error instanceof Error && 'response' in error
              ? JSON.stringify((error as any).response?.data)
              : undefined
          }
        };
      }
    });
  }

  /**
   * Execute an API call for a tool
   */
  private async executeApiCall(tool: OpenApiTool, params: Record<string, any>): Promise<any> {
    // Get method and path from tool
    const method = tool.method;
    let path = tool.path;

    // Clone params to avoid modifying the original
    const requestParams = { ...params };

    // Replace path parameters with values from params
    Object.entries(requestParams).forEach(([key, value]) => {
      const placeholder = \`{\${key}}\`;
      if (path.includes(placeholder)) {
        path = path.replace(placeholder, encodeURIComponent(String(value)));
        delete requestParams[key]; // Remove used parameter
      }
    });

    // Build the full URL
    const baseUrl = this.baseUrl.endsWith("/") ? this.baseUrl : \`\${this.baseUrl}/\`;
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(cleanPath, baseUrl).toString();

    this.log('debug', \`API Request: \${method} \${url}\`);

    try {
      // Configure the request
      const config: AxiosRequestConfig = {
        method: method.toLowerCase(),
        url,
        headers: { ...this.headers },
      };

      // Apply security headers based on tool security requirements
      if (tool.security && Array.isArray(tool.security)) {
        for (const requirement of tool.security) {
          for (const securitySchemeName of Object.keys(requirement)) {
            const securityDefinition = SECURITY_SCHEMES[securitySchemeName];

            if (securityDefinition) {
              const authType = securityDefinition.type;

              // Handle API key
              if (authType === 'apiKey') {
                const apiKeyName = securityDefinition.name || '';
                const envVarName = \`\${securitySchemeName.toUpperCase()}_\${apiKeyName.toUpperCase()}\`;
                const apiKeyValue = process.env[envVarName];

                if (apiKeyValue) {
                  if (securityDefinition.in === 'header') {
                    config.headers = config.headers || {};
                    config.headers[apiKeyName] = apiKeyValue;
                  } else if (securityDefinition.in === 'query') {
                    config.params = config.params || {};
                    config.params[apiKeyName] = apiKeyValue;
                  }
                } else {
                  this.log('warning', \`API Key environment variable not found: \${envVarName}\`);
                }
              }
              // Handle bearer token
              else if (authType === 'http' && securityDefinition.scheme === 'bearer') {
                const envVarName = \`\${securitySchemeName.toUpperCase()}_BEARERTOKEN\`;
                const bearerToken = process.env[envVarName];

                if (bearerToken) {
                  config.headers = config.headers || {};
                  config.headers['Authorization'] = \`Bearer \${bearerToken}\`;
                } else {
                  this.log('warning', \`Bearer Token environment variable not found: \${envVarName}\`);
                }
              }
              // Handle basic auth
              else if (authType === 'http' && securityDefinition.scheme === 'basic') {
                const username = process.env[\`\${securitySchemeName.toUpperCase()}_USERNAME\`];
                const password = process.env[\`\${securitySchemeName.toUpperCase()}_PASSWORD\`];

                if (username && password) {
                  const auth = Buffer.from(\`\${username}:\${password}\`).toString('base64');
                  config.headers = config.headers || {};
                  config.headers['Authorization'] = \`Basic \${auth}\`;
                } else {
                  this.log('warning', \`Basic auth credentials not found for \${securitySchemeName}\`);
                }
              }
            }
          }
        }
      }

      // Add parameters based on request method
      if (["GET", "DELETE"].includes(method)) {
        // For GET/DELETE, send params as query string
        config.params = { ...(config.params || {}), ...requestParams };
      } else {
        // For POST/PUT/PATCH, send params as JSON body
        config.data = requestParams;
        if (config.headers) {
          config.headers["Content-Type"] = "application/json";
        }
      }

      this.log('debug', "Request config:", {
        url: config.url,
        method: config.method,
        params: config.params,
        headers: config.headers ? Object.keys(config.headers) : []
      });

      // Execute the request
      const response = await axios(config);
      this.log('debug', \`Response status: \${response.status}\`);

      return response.data;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', \`API request failed: \${errorMessage}\`);

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const responseData = axiosError.response?.data;
        const responseStatus = axiosError.response?.status;

        this.log('error', 'API Error Details:', {
          status: responseStatus,
          data: typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData)
        });

        // Rethrow with more context for better error handling
        const detailedError = new Error(\`API request failed with status \${responseStatus}: \${errorMessage}\`);
        (detailedError as any).response = axiosError.response;
        throw detailedError;
      }

      throw error;
    }
  }

  /**
   * Log messages with appropriate level
   * Only sends to MCP if we're connected
   */
  private log(level: 'debug' | 'info' | 'warning' | 'error', message: string, data?: any): void {
    // Always log to stderr for visibility
    console.error(\`[\${level.toUpperCase()}] \${message}\${data ? ': ' + JSON.stringify(data) : ''}\`);

    // Only try to send via MCP if we're in debug mode or it's important
    if (this.debug || level !== 'debug') {
      try {
        // Only send if server exists and is connected
        if (this.server && (this.server as any).isConnected) {
          this.server.sendLoggingMessage({
            level,
            data: \`[MCP Server] \${message}\${data ? ': ' + JSON.stringify(data) : ''}\`
          });
        }
      } catch (e) {
        // If logging fails, log to stderr
        console.error('Failed to send log via MCP:', (e as Error).message);
      }
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Create stdio transport
      const transport = new StdioServerTransport();
      console.error("MCP Server starting on stdio transport");

      // Connect to the transport
      await this.server.connect(transport);

      // Now we can safely log via MCP
      console.error(\`Registered \${this.tools.size} tools\`);
      this.log('info', \`MCP Server started successfully with \${this.tools.size} tools\`);
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      process.exit(1);
    }
  }
}

// Start the server
async function main(): Promise<void> {
  try {
    const server = new MCPServer();
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
`;

  return serverCode;
}

export { generateServerFile, generateServerTS };