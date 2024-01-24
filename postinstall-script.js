const fs = require('fs');
const path = require('path');

const configFileContent = {
  // swagger文档接口地址
  swaggerUrl: '',
  // 生成文件路径
  outputPath: 'src/app/server',

}

const configFilePath = path.join(process.cwd(), '.generate-ts-config.json')

fs.writeFileSync(configFilePath, JSON.stringify(configFileContent, null, 2));

console.log('Config file created at:', configFilePath)