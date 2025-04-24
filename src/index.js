#!/usr/bin/env node

// Basic imports using ES module syntax
import chalk from "chalk";
import minimist from 'minimist';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadOpenAPISpec } from './openapi-loader.js';
import { generateTools } from './tool-generator.js';
import { generateServerFile, generateServerTS } from './server-generator.js';
import {
    generatePackageJson,
    generateReadme,
    generateEnvExample,
    generateTypeDefinitions,
    generateTsConfig,
    generateBuildScript
} from './config-generator.js';
import { copyTemplateFile } from './file-utils.js';
import { generateServerConf } from './utils.js';

// Get proper paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Script started');

/**
 * Main function to drive the entire process
 */
async function main() {
    try {
        console.log('🚀 OpenAPI to MCP Server Generator');

        // Parse command-line arguments with minimist
        const argv = minimist(process.argv.slice(2), {
            string: ['openapi', 'output', 'name', 'version', 'transport'],
            number: ['port'],
            alias: {
                o: 'openapi',
                d: 'output',
                n: 'name',
                v: 'version',
                t: 'transport',
                p: 'port',
                V: 'verbose'
            },
            default: {
                output: './mcp-server',
                name: 'openapi-mcp-server',
                version: '1.0.0',
                transport: 'stdio',
                port: 3000,
                verbose: false
            }
        });

        // Check required parameters
        if (!argv.openapi) {
            console.error('Error: --openapi parameter is required');
            console.error('Usage: ./index.js --openapi <path-or-url> [--output <dir>]');
            process.exit(1);
        }

        // Create configuration object
        const config = {
            openApiSpec: argv.openapi,
            outputDir: argv.output,
            name: argv.name,
            version: argv.version,
            transport: argv.transport,
            port: argv.port,
            verbose: argv.verbose
        };

        console.log(`Configuration:`);
        console.log(`- OpenAPI Spec: ${config.openApiSpec}`);
        console.log(`- Output Directory: ${config.outputDir}`);
        console.log(`- Server Name: ${config.name}`);
        console.log(`- Transport: ${config.transport}`);

        // Load OpenAPI spec
        const spec = await loadOpenAPISpec(config.openApiSpec, config.verbose);

        if (!spec) {
            throw new Error("Failed to load or parse the OpenAPI specification");
        }

        // Check if it's a valid OpenAPI spec
        if (!spec.openapi && !spec.swagger) {
            console.warn("Warning: The loaded specification might not be a valid OpenAPI document. Missing 'openapi' or 'swagger' version field.");
        }

        // Generate tools from spec
        const { tools, toolMap, securitySchemes } = generateTools(spec, config.verbose);
        const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;


        if (tools.length === 0) {
            console.warn("Warning: No API tools were generated from the specification. The spec might not contain valid paths/operations.");
        }

        // Create output directory if it doesn't exist
        if (!fs.existsSync(config.outputDir)) {
            console.log(`Creating output directory: ${config.outputDir}`);
            await mkdir(config.outputDir, { recursive: true });
        }

        // Generate all the files
        console.log("Generating server files...");
        const serverCode = generateServerFile(config, spec, toolMap, securitySchemes);
        const serverTSCode = generateServerTS(config, spec, toolMap, securitySchemes);
        const packageJson = generatePackageJson(config, spec);
        const readme = generateReadme(config, spec, tools, hasSecuritySchemes);
        const envExample = generateEnvExample(config, securitySchemes);
        const typeDefinitions = generateTypeDefinitions(tools);
        const tsConfig = generateTsConfig();
        const buildScript = generateBuildScript();

        // Write all files
        console.log("Writing files to output directory...");
        const results = await Promise.all([
            copyTemplateFile('server.js', serverCode, config.outputDir, config.verbose),
            copyTemplateFile('server.ts', serverTSCode, config.outputDir, config.verbose),
            copyTemplateFile('package.json', packageJson, config.outputDir, config.verbose),
            copyTemplateFile('README.md', readme, config.outputDir, config.verbose),
            copyTemplateFile('.env.example', envExample, config.outputDir, config.verbose),
            copyTemplateFile('types.d.ts', typeDefinitions, config.outputDir, config.verbose),
            copyTemplateFile('tsconfig.json', tsConfig, config.outputDir, config.verbose),
            copyTemplateFile('build.js', buildScript, config.outputDir, config.verbose)
        ]);

        // Configuration for MCP server for client
        const serverName = path.basename(config.outputDir)
        const absolutePath = path.resolve(config.outputDir);
        const serverConfig = await generateServerConf(absolutePath)
        const fullConfig = { mcpServers: { [serverName]: serverConfig } };
        const success = results.every(Boolean);

        if (success) {
            console.log(`\n✅ MCP server generated successfully in "${config.outputDir}"`);
            console.log(`📚 Generated ${tools.length} tools from OpenAPI spec`);
            console.log('\nNext steps:');
            console.log('1. cd ' + config.outputDir);
            console.log('2. npm install');
            console.log('3. cp .env.example .env (and edit with your API details)');
            console.log('4. Run the server:');
            console.log('   - JavaScript version: npm start');
            console.log('   - TypeScript version: npm run start:ts');
            console.log('5. Config the client:')
            console.log(
                `   To add the MCP server manually, add the following config to your MCP config-file:\n\n${chalk.yellow(JSON.stringify(fullConfig, null, 2))}`)
        } else {
            console.error("❌ Some files failed to generate. Check the errors above.");
        }

        return success;
    } catch (error) {
        console.error('❌ Error generating MCP server:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

// Run the program
main().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});