# OpenAPI to MCP server Generator
一个命令行工具，根据OpenAPI规范生成模型上下文协议（Model Context Protocol，简称MCP）服务器代码。该工具帮助您快速创建一个MCP服务器，作为大型语言模型（LLMs）和您的API之间的桥梁。

[![npm version](https://img.shields.io/npm/v/openapi-mcpserver-generator.svg)](https://www.npmjs.com/package/openapi-mcpserver-generator)
[![License: MIT](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/MIT)

## 初始说明
此repo最初是从[openapi-mcp-generator](https://github.com/harsha-iiiv/openapi-mcp-generator) fork出来的，并添加了一些附加功能：
- 支持OpenAPI规范中的嵌套`$ref`
- 不仅生成源代码，还生成MCP服务器配置
- 允许客户端设置日志级别并将日志信息作为通知发送给客户端
- 遇到错误时，将消息发送到stderr
## 特性
- **自动工具生成**：将OpenAPI规范中的每个API端点转换为一个MCP工具
- **传输选项**：只支持stdio，对于sse，可以利用[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)
- **完整项目设置**：生成运行MCP服务器所需的所有文件
- **简便的配置**：为生成的服务器提供基于环境的简单配置
## 安装
```bash
# 从npm全局安装
npm install -g openapi-mcpserver-generator
# 或使用yarn
yarn global add openapi-mcpserver-generator
# 或使用pnpm
pnpm add -g openapi-mcpserver-generator
```
## 使用
根据OpenAPI规范生成一个MCP服务器：
```bash
openapi-mcpserver-generator --openapi path/to/openapi.json --output /Path/to/output
```
### 命令行选项
| 选项 | 别名 | 描述 | 默认值 |
|--------|-------|-------------|---------|
| `--openapi` | `-o` | OpenAPI规范的路径或URL | （必需） |
| `--output` | `-d` | 生成文件的输出目录 | `./mcp-server` |
| `--name` | `-n` | MCP服务器的名称 | `openapi-mcp-server` |
| `--version` | `-v` | MCP服务器的版本 | `1.0.0` |
| `--transport` | `-t` | 传输机制（stdio, websocket, http） | `stdio` |
| `--help` | `-h` | 显示帮助信息 | |
### 示例
从本地OpenAPI文件生成：
```bash
openapi-mcpserver-generator --openapi ./specs/petstore.json --output ./petstore-mcp
```
从远程OpenAPI URL生成：
```bash
openapi-mcpserver-generator --openapi https://petstore3.swagger.io/api/v3/openapi.json --output ./petstore-mcp
```
## 生成的文件
该工具在输出目录中生成以下文件：
- `server.js` - 主要的MCP服务器实现
- `package.json` - 依赖项和脚本
- `README.md` - 为生成的服务器提供的文档
- `.env.example` - 环境变量的模板
- `types.d.ts` - API的Typescript类型定义
- `tsconfig.json` - TypeScript配置
## 使用生成的服务器
生成MCP服务器后：
1. 进入生成的目录：
   ```bash
   cd my-mcp-server
   ```
2. 安装依赖：
   ```bash
   npm install
   ```
3. 创建一个环境文件：
   ```bash
   cp .env.example .env
   ```
4. 编辑`.env`以设置您的API基本URL和任何必需的头部：
   ```
   API_BASE_URL=https://api.example.com
   API_HEADERS=Authorization:Bearer your-token-here
   ```
5. 启动服务器：
   ```bash
   npm start
   ```
## 要求
- Node.js 16.x 或更高版本
- npm 7.x 或更高版本
## E2E示例
建议使用[mcphost](https://github.com/vincent-pli/mcphost)作为MCP主机进行尝试。
这个工具（`mcphost`）可以同时支持Azure Openai和deepseek
您可以像这样添加生成的MCP服务器配置：
```
{
  "mcpServers": {
    "petstore-mcp": {
      "command": "/usr/local/bin/node",
      "args": [
        "/Users/lipeng/workspaces/github.com/vincent-pli/openapi-mcpserver-generator/petstore-mcp/server.js",
        "run"
      ]
    }
  }
}
```
到`~/.mcp.json`(默认的`mcphost`的MCP服务器配置路径)，然后进行尝试
## 许可证
Apache 2.0