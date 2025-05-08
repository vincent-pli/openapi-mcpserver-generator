function generateDockerFiles(){
    console.log('Generating Dockerfile file...');
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "server.js", "run"]
`
    const dockerIgnorefile = `node_modules
npm-debug.log
.DS_Store
.git
`
    return [dockerfile, dockerIgnorefile]

}

export { generateDockerFiles };