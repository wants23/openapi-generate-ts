const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const prettier = require('prettier')
/** 获取根目录下prettierrc Config path*/
const prettierrcjsPath = path.resolve('./prettierrc.js')
const prettierrcPath = path.resolve('./prettierrc')
/** 获取根目录下配置文件路径*/
const generateTSConfigPath = path.resolve('.generate-ts-config.json')

const suffix = 'Type';

/** 清楚字符串空格 */
const clearStringSpace = (string) => {
  return string?.replace(/\s*/g, '');
}
/** 获取interface 类型 */
const getInterfaceType = (originalRef) => {
  return `${clearStringSpace(originalRef)}${suffix}`
}

/** 获取json */
const httpsgetJson = (url) => {
  const isHTTPSUrl = url.startsWith('https');
  return new Promise((resolve, reject) => {
    (isHTTPSUrl ? https : http)
      .get(url, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];
        let error;
        if (statusCode !== 200) {
          error = new Error('请求失败。' + `状态码: ${statusCode}`);
        } else if (!contentType.includes('application/json')) {
          error = new Error('无效的 content-type.' + `期望 application/json 但获取的是 ${contentType}`);
        }
        if (error) {
          console.error(error.message);
          // 消耗响应数据以释放内存
          res.resume();
          return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            reject(`错误: ${e.message}`);
          }
        });
      })
      .on('error', (e) => {
        reject(`错误: ${e.message}`);
      });
  });
};

/** 生成文件头部信息 */
const generatorFileHeadContent = () => {
  return `/*
* ---------------------------------------------------------------
* ## 此文件是脚本自动生成的，请勿手动修改谢谢！                    ##
* ---------------------------------------------------------------
*/
import { BASE_URL, doRequestUrl } from 'src/app/api/commonRequest';
`;
};

/** 根据swagger类型 映射拿到 ts类型 */
const getTypesFromSwaggerType = (typeObj) => {
  const { items, type, originalRef } = typeObj || {};
  if (type === 'integer') {
    return 'number';
  }
  if (type === 'array') {
    if (items?.originalRef) {
      return `${getInterfaceType(items.originalRef)}[]`;
    } else if (items?.type === 'integer') {
      return `number[]`;
    } else {
      return `${items?.type}[]`;
    }
  }
  if (originalRef) {
    return getInterfaceType(originalRef);
  }
  return type;
};

/** 生成ts interface */
const generatorInterface = (originalRef, definitions, refMap, fileName) => {
  const { properties, required, description, title, type: refType } = definitions[originalRef] || {};
  if (!originalRef) {
    return '';
  }
  if (refMap[originalRef]) {
    // 如果originalRef interface已经存在，那么就从已存在的文件中导入。注意：已导入的文件不要重复导入
    if (!refMap[originalRef].includes(fileName)) {
      const firstFileName = refMap[originalRef].split('-')[0]
      refMap[originalRef] += `-${fileName}`;
      return `import { ${getInterfaceType(originalRef)} } from './${firstFileName}';`
    }
    return '';
  }
  // 存下此originalRef interface所在文件名
  refMap[originalRef] = fileName;
  // properties不存在一般是object类型
  if (!properties) {
    return `export type ${getInterfaceType(originalRef)} = ${refType};`
  }
  // 记录其他属性的interface
  let otherPropertiesInterface = '';
  const typeList = [];
  for (const type in properties) {
    const typeName = getTypesFromSwaggerType(properties[type]);
    const typeDescription = properties[type]?.description;
    const ref = properties[type].originalRef ?? properties[type]?.items?.originalRef;
    typeList.push({ key: type, type: typeName, description: typeDescription, required: required ? required?.includes(type) : true });
    otherPropertiesInterface += generatorInterface(ref, definitions, refMap, fileName);
  }
  // interface 内部属性的类型 list
  const typeListString = typeList
    .map((item) => `${item.description ? `/** ${item.description} */ \n` : ''}${item.key}${item.required ? ':' : '?:'} ${item.type}`)
    .join(';\n    ');

  return `${otherPropertiesInterface}\n${description ? `/** ${description} */` : ''}
export interface ${getInterfaceType(originalRef)} {
    ${typeListString}
}
`;
};

/** 生成前端接口请求方法 */
const generateFetchFunction = ({ functionName, summary, requestType = 'any', responseType = 'any', url }) => {
  return `/** ${summary} */
export const ${functionName} = (params: ${requestType}) => {
    return doRequestUrl<${requestType}, ${responseType}>(BASE_URL, '${url}', params);
}
`;
};

/** 创建多级目录 同步方法 */
const createNestedDirectories = (dirPath) => {
  const directories = dirPath.split('/');

  directories.reduce((currentPath, directory) => {
    currentPath = path.join(currentPath, directory);

    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath);
    }
    return currentPath;
  }, '');
};

/** 获取prettier配置 */
const getPrettierConfig = () => {
  try {
    let config = {};
    if (fs.existsSync(prettierrcjsPath)) {
      config = JSON.parse(fs.readFileSync(prettierrcjsPath));

    } else if (fs.existsSync(prettierrcPath)) {
      config = JSON.parse(fs.readFileSync(prettierrcPath));
    }
    console.log('config', config)

    return {
      ...config,
      parser: 'typescript'
    }
  } catch (error) {
    console.log('error to get prettier config, use {}');
    return {};
  }
}

/** 格式化文件内容 */
const formatFile = async (content) => {
  const config = getPrettierConfig();
  return prettier.format(content, config)
}

/** 默认配置 */
const DefaultConfig = {
  "swaggerUrl": "",
  "outputPath": "src/app/server"
}

/** 获取 .generate-ts-config.json 配置 */
const getGenerateTSConfig = () => {
  try {
    if (fs.existsSync(generateTSConfigPath)) {
      return JSON.parse(fs.readFileSync(generateTSConfigPath));
    } else {
      return DefaultConfig;
    }

  } catch (error) {
    console.log('error to get .generate-ts-config.json config, use DefaultConfig');
    return DefaultConfig;
  }
}

module.exports = {
  clearStringSpace,
  getInterfaceType,
  httpsgetJson,
  generatorFileHeadContent,
  getTypesFromSwaggerType,
  generatorInterface,
  generateFetchFunction,
  createNestedDirectories,
  formatFile,
  getGenerateTSConfig
}