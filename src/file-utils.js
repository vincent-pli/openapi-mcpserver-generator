import { writeFile } from 'fs/promises';
import path from 'path';

/**
 * Copy the required MCP server template file if it doesn't exist in the output
 */
async function copyTemplateFile(file, content, outputDir, verbose = false) {
    const outputPath = path.join(outputDir, file);
    try {
        await writeFile(outputPath, content);
        console.log(`✓ Created ${outputPath}`);
        if (verbose) {
            console.log(`  File size: ${content.length} bytes`);
        }
        return true;
    } catch (error) {
        console.error(`✗ Failed to create ${outputPath}: ${error.message}`);
        throw error;
    }
}

export { copyTemplateFile };