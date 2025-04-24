import path from 'path';



async function findNodePath() {
    try {
      return process.execPath;
    } catch (error) {
      try {
        const cmd = process.platform === "win32" ? "where" : "which";
        const { stdout } = await execAsync(`${cmd} node`);
        return stdout.toString().trim().split("\n")[0];
      } catch (err) {
        return "node"; // Fallback
      }
    }
  }

async function generateServerConf(absolutePath){
    const nodePath = await findNodePath();
    const config = {
      command: nodePath,
      args: [path.join(absolutePath, 'server.js'), "run"],
    };

    return config
}

export { generateServerConf };