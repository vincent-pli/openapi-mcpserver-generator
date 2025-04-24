/**
 * Generate a clean tool ID from an API path and method
 */
function generateToolId(method, path) {
    // Remove leading slash and parameters
    const cleanPath = path.replace(/^\//, '').replace(/[{}]/g, '');
    // Create a clean tool ID
    return `${method.toUpperCase()}-${cleanPath}`.replace(/[^a-zA-Z0-9-]/g, '-');
}

function getComponentPath(fullPath) {
    return fullPath.split("/").pop()
}

function generateSchemabyComponent(spec, componentPath) {
    const component = spec.components?.schemas[componentPath]
    let toolInputSchema = {
        type: 'object',
        properties: {},
        required: [],
    }
    for (const [propName, propSchema] of Object.entries(component.properties)) {
        if (propSchema["$ref"]) {
            toolInputSchema.properties[propName] = generateSchemabyComponent(spec, getComponentPath(propSchema["$ref"]))
            continue
        }

        toolInputSchema.properties[propName] = {
            type: propSchema.type || 'string',
            description: propSchema.description || `${propName} property`,
        };
        if (propSchema.type == 'array') {
            let items = {}
            if (propSchema.items['$ref']) {
                items = generateSchemabyComponent(spec, getComponentPath(propSchema.items['$ref']))
            } else {
                items.type = propSchema.items.type
            }
            toolInputSchema.properties[propName].items = items
        }

        // Add enum values if present
        if (propSchema.enum) {
            toolInputSchema.properties[propName].enum = propSchema.enum;
        }
    }

    // Add required properties
    if (component.required && Array.isArray(component.required)) {
        toolInputSchema.required.push(...component.required);
    }

    return toolInputSchema
}
/**
 * Generate tool definitions from OpenAPI paths
 */
function generateTools(spec, verbose = false) {
    const toolList = [];
    const toolMapObj = {};
    const securitySchemes = spec.components?.securitySchemes || {};

    // Check if spec.paths exists
    if (!spec.paths) {
        console.warn("Warning: No paths found in OpenAPI specification");
        return { tools: toolList, toolMap: toolMapObj, securitySchemes };
    }

    console.log(`Processing ${Object.keys(spec.paths).length} API paths...`);

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem) continue;

        for (const [method, operation] of Object.entries(pathItem)) {
            if (method === 'parameters' || !operation || typeof method !== 'string') continue;

            // Skip if not a valid HTTP method
            const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
            if (!validMethods.includes(method.toLowerCase())) continue;

            const op = operation;
            // Get a unique ID for this tool
            const toolId = generateToolId(method, path);
            // Create a friendly name
            const toolName = op.operationId || op.summary || `${method.toUpperCase()} ${path}`;

            if (verbose) {
                console.log(`Processing endpoint: ${method.toUpperCase()} ${path} -> Tool ID: ${toolId}`);
            }

            const tool = {
                id: toolId,
                name: toolName,
                description: op.description || `Make a ${method.toUpperCase()} request to ${path}`,
                method: method.toUpperCase(),
                path: path,
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                },
                security: op.security || spec.security || [] // Get security requirements for the operation or spec
            };

            // Add parameters from operation
            if (op.parameters) {
                for (const param of op.parameters) {
                    if ('name' in param && 'in' in param) {
                        const paramSchema = param.schema;

                        // Add parameter to the schema
                        tool.inputSchema.properties[param.name] = {
                            type: paramSchema?.type || 'string',
                            description: param.description || `${param.name} parameter`,
                        };

                        if (paramSchema?.type == 'array') {
                            let items = {}
                            if (paramSchema?.items['$ref']) {
                                items = generateSchemabyComponent(spec, getComponentPath(paramSchema?.items['$ref']))
                            } else {
                                items.type = paramSchema?.items.type
                            }
                            tool.inputSchema.properties[param.name].items = items
                        }

                        // Add enum values if present
                        if (paramSchema?.enum) {
                            tool.inputSchema.properties[param.name].enum = paramSchema.enum;
                        }

                        // Add required flag if needed
                        if (param.required) {
                            tool.inputSchema.required.push(param.name);
                        }
                    }
                }
            }

            // Handle request body for POST/PUT/PATCH methods
            if (['post', 'put', 'patch'].includes(method.toLowerCase()) && op.requestBody) {
                const contentType = op.requestBody.content?.['application/json'];

                if (contentType && contentType.schema) {
                    const bodySchema = contentType.schema;

                    // Add body properties to the tool's input schema
                    if (bodySchema.properties) {
                        for (const [propName, propSchema] of Object.entries(bodySchema.properties)) {
                            tool.inputSchema.properties[propName] = {
                                type: propSchema.type || 'string',
                                description: propSchema.description || `${propName} property`,
                            };

                            // Add enum values if present
                            if (propSchema.enum) {
                                tool.inputSchema.properties[propName].enum = propSchema.enum;
                            }
                        }

                        // Add required properties
                        if (bodySchema.required && Array.isArray(bodySchema.required)) {
                            tool.inputSchema.required.push(...bodySchema.required);
                        }
                    }
                    else if (bodySchema?.["$ref"]) {
                        tool.inputSchema = {...tool.inputSchema, ...generateSchemabyComponent(spec, getComponentPath(bodySchema?.["$ref"]))}
                    }
                }
            }

            toolList.push(tool);
            toolMapObj[toolId] = tool;
        }
    }

    console.log(`Generated ${toolList.length} MCP tools from the OpenAPI spec`);
    return { tools: toolList, toolMap: toolMapObj, securitySchemes }; // return securitySchemes as well
}

export { generateToolId, generateTools };