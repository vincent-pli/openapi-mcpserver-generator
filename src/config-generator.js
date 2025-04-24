/**
 * Generate .env.example with enhanced auth examples
 */
function generateEnvExample(config, securitySchemes) {
    console.log('Generating .env.example file...');
    let authExamples = '';
    if (securitySchemes && Object.keys(securitySchemes).length > 0) {
        authExamples = `# --- Authorization Configuration --- \n`;
        for (const [schemeName, schemeDef] of Object.entries(securitySchemes)) {
            if (schemeDef.type === 'apiKey') {
                authExamples += `# Example for API Key "${schemeName}" (${schemeDef.in || 'header'}: ${schemeDef.name})\n`;
                authExamples += `${schemeName.toUpperCase()}_${schemeDef.name.toUpperCase()}=YOUR_API_KEY_VALUE\n`;
            } else if (schemeDef.type === 'http' && schemeDef.scheme === 'bearer') {
                authExamples += `# Example for HTTP Bearer Token "${schemeName}"\n`;
                authExamples += `${schemeName.toUpperCase()}_BEARERTOKEN=YOUR_BEARER_TOKEN_VALUE\n`;
            } else if (schemeDef.type === 'http' && schemeDef.scheme === 'basic') {
                authExamples += `# Example for HTTP Basic Auth "${schemeName}"\n`;
                authExamples += `${schemeName.toUpperCase()}_USERNAME=YOUR_USERNAME\n`;
                authExamples += `${schemeName.toUpperCase()}_PASSWORD=YOUR_PASSWORD\n`;
            }
        }
    }

    return `# API Configuration
API_BASE_URL=https://api.example.com
API_HEADERS= # (Less common now, use specific auth env vars below instead)

# Server Configuration
SERVER_NAME=${config.name}
SERVER_VERSION=${config.version}
TRANSPORT=stdio # Fixed to stdio

# Debug
DEBUG=false

${authExamples}
`;
}

/**
 * Generate README.md with enhanced auth instructions
 */
function generateReadme(config, spec, tools, hasSecuritySchemes) {
    console.log('Generating README.md file...');
    const readme = `# ${config.name}

Model Context Protocol (MCP) server for ${spec.info?.title || 'OpenAPI'} API.

## Description

${spec.info?.description || 'This server provides a Model Context Protocol (MCP) interface to the API.'}

## Installation

1. Install dependencies:

\`\`\`bash
npm install
\`\`\`

2. Create a \`.env\` file based on \`.env.example\`:

\`\`\`bash
cp .env.example .env
\`\`\`

3. Edit the \`.env\` file to add your API configuration and authorization details.

## Configuration

The following environment variables can be configured in the \`.env\` file:

- \`API_BASE_URL\`: Base URL for the API (required)
- \`SERVER_NAME\`: Name of the MCP server (default: "${config.name}")
- \`SERVER_VERSION\`: Version of the MCP server (default: "${config.version}")
- \`DEBUG\`: Enable debug logging (true/false) (default: false)

${hasSecuritySchemes ? `
### Authorization Configuration

This server supports the following authorization schemes defined in the OpenAPI specification:

${Object.entries(spec.components?.securitySchemes || {}).map(([schemeName, schemeDef]) => {
        let configDetails = '';
        if (schemeDef.type === 'apiKey') {
            configDetails = `- **${schemeName} (API Key)**:  Set environment variable \`${schemeName.toUpperCase()}_${schemeDef.name.toUpperCase()}\` with your API key. The key will be sent in the \`${schemeDef.name}\` ${schemeDef.in || 'header'}.`;
        } else if (schemeDef.type === 'http' && schemeDef.scheme === 'bearer') {
            configDetails = `- **${schemeName} (HTTP Bearer)**: Set environment variable \`${schemeName.toUpperCase()}_BEARERTOKEN\` with your Bearer token. The token will be sent in the \`Authorization\` header.`;
        } else if (schemeDef.type === 'http' && schemeDef.scheme === 'basic') {
            configDetails = `- **${schemeName} (HTTP Basic)**: Set environment variables \`${schemeName.toUpperCase()}_USERNAME\` and \`${schemeName.toUpperCase()}_PASSWORD\` with your credentials. These will be encoded and sent in the \`Authorization\` header.`;
        } else {
            configDetails = `- **${schemeName} (${schemeDef.type})**: Configuration details for this scheme type are not fully described in this template. Refer to the OpenAPI specification and update \`.env.example\` and server code manually if needed.`;
        }
        return configDetails;
    }).join('\n\n')}

`: ''}

## Usage

### Running the Server

The server is provided as both JavaScript and TypeScript versions:

\`\`\`bash
# Run JavaScript version
npm start

# Or run TypeScript version (compiles on the fly)
npm run start:ts
\`\`\`

### Building the TypeScript Version

\`\`\`bash
npm run build
cd dist
node server.js
\`\`\`

## Using as an MCP Tool Provider

This server implements the Model Context Protocol (MCP) and can be used with any MCP-compatible consumer, like Claude.js client or other MCP consumers.

Example of connecting to this server from a Claude.js client:

\`\`\`javascript
import { MCP } from "claude-js";
import { createStdio } from "claude-js/mcp";

// Create stdin/stdout transport
const transport = createStdio({ command: "node path/to/server.js" });

// Connect to the MCP server
const mcp = new MCP({ transport });
await mcp.connect();

// List available tools
const { tools } = await mcp.listTools();
console.log("Available tools:", tools);

// Call a tool
const result = await mcp.callTool({
    id: "TOOL-ID",
    arguments: { param1: "value1" }
});
console.log("Tool result:", result);
\`\`\`

## Available Tools

This MCP server provides the following tools:

${tools.map(tool => `### ${tool.name}

- **ID**: \`${tool.id}\`
- **Description**: ${tool.description || 'No description provided'}
- **Method**: \`${tool.method}\`
- **Path**: \`${tool.path}\`

${Object.keys(tool.inputSchema.properties).length > 0 ? '**Parameters**:\n\n' +
            Object.entries(tool.inputSchema.properties).map(([name, prop]) =>
                `- \`${name}\`: ${prop.description || name} ${tool.inputSchema.required?.includes(name) ? '(required)' : ''}`
            ).join('\n') : 'No parameters required.'}`).join('\n\n')}

## License

MIT
`;
    return readme;
}

/**
 * Generate package.json for the MCP server
 */
function generatePackageJson(config, spec) {
    console.log('Generating package.json file...');
    const packageJson = {
        name: config.name.toLowerCase().replace(/\s+/g, '-'),
        version: config.version,
        description: `MCP server for ${spec.info?.title || 'OpenAPI'} API`,
        type: 'module',
        main: 'server.js',
        scripts: {
            start: 'node server.js',
            build: 'node build.js',
            "start:ts": "npx tsc && node dist/server.js"
        },
        dependencies: {
            '@modelcontextprotocol/sdk': '^1.0.0',
            'axios': '^1.6.0',
            'dotenv': '^16.0.0',
        },
        devDependencies: {
            '@types/node': '^20.11.0',
            'typescript': '^5.3.3'
        },
        engines: {
            'node': '>=16.0.0'
        }
    };

    return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate a TypeScript declaration file
 */
function generateTypeDefinitions(tools) {
    console.log('Generating types.d.ts file...');
    return `/**
 * Type definitions for the API endpoints
 * Auto-generated from OpenAPI specification
 */

export interface APITools {
${tools.map(tool => `  /**
   * ${tool.description || tool.name}
   */
  "${tool.id}": {
    params: {
${Object.entries(tool.inputSchema.properties).map(([name, prop]) =>
        `      /**
       * ${prop.description || name}
       */
      ${name}${tool.inputSchema.required?.includes(name) ? '' : '?'}: ${prop.type === 'integer' ? 'number' : prop.type};`
    ).join('\n')}
    };
    response: any; // Response structure will depend on the API
  };`).join('\n\n')}
}
`;
}

/**
 * Generate the tsconfig.json file
 */
function generateTsConfig() {
    console.log('Generating tsconfig.json file...');
    return `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["*.ts", "*.js"],
  "exclude": ["node_modules"]
}
`;
}

/**
 * Generate build.js script for TypeScript compilation
 */
function generateBuildScript() {
    console.log('Generating build.js file...');
    return `#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get proper paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure dist directory exists
if (!fs.existsSync('./dist')) {
    fs.mkdirSync('./dist');
}

// Run TypeScript compiler
console.log('Compiling TypeScript...');
exec('npx tsc', (error, stdout, stderr) => {
    if (error) {
        console.error('Error compiling TypeScript:', error);
        console.error(stderr);
        process.exit(1);
    }

    if (stdout) {
        console.log(stdout);
    }

    console.log('TypeScript compilation successful');

    // Copy .env.example to dist
    try {
        if (fs.existsSync('./.env.example')) {
            fs.copyFileSync('./.env.example', './dist/.env.example');
            console.log('Copied .env.example to dist directory');
        }

        // Create package.json in dist
        const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        packageJson.main = 'server.js';
        fs.writeFileSync('./dist/package.json', JSON.stringify(packageJson, null, 2));
        console.log('Created package.json in dist directory');

        console.log('Build completed successfully');
    } catch (err) {
        console.error('Error copying files:', err);
        process.exit(1);
    }
});
`;
}


export {
    generatePackageJson,
    generateReadme,
    generateEnvExample,
    generateTypeDefinitions,
    generateTsConfig,
    generateBuildScript
};