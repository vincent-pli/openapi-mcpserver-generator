import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import axios from 'axios';

/**
 * Load OpenAPI specification from file or URL
 */
async function loadOpenAPISpec(specPath, verbose = false) {
    try {
        if (specPath.startsWith('http')) {
            // Load from URL
            console.log(`Loading OpenAPI spec from URL: ${specPath}`);
            const response = await axios.get(specPath);
            if (verbose) {
                console.log(`Successfully loaded OpenAPI spec from URL (${Object.keys(response.data).length} keys in spec)`);
            }
            return response.data;
        } else {
            // Load from local file
            const resolvedPath = path.resolve(specPath);
            console.log(`Loading OpenAPI spec from file: ${resolvedPath}`);

            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`File not found: ${resolvedPath}`);
            }

            const content = await readFile(resolvedPath, 'utf-8');
            try {
                const parsed = JSON.parse(content);
                if (verbose) {
                    console.log(`Successfully loaded OpenAPI spec from file (${Object.keys(parsed).length} keys in spec)`);
                }
                return parsed;
            } catch (parseError) {
                throw new Error(`Failed to parse JSON from ${resolvedPath}: ${parseError.message}`);
            }
        }
    } catch (error) {
        console.error(`Failed to load OpenAPI spec: ${error.message}`);
        if (error.response) {
            console.error(`HTTP Status: ${error.response.status}`);
            console.error(`Response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

export { loadOpenAPISpec };