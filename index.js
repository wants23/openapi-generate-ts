const fs = require('fs');
const {
  clearStringSpace,
  httpsgetJson,
  generatorFileHeadContent,
  getTypesFromSwaggerType,
  generatorInterface,
  generateFetchFunction,
  createNestedDirectories,
  formatFile,
  getGenerateTSConfig
} = require('./common');

const currentData = {
  path: '',
};
(async () => {
  try {
    const { swaggerUrl, outputPath } = getGenerateTSConfig()

    if (!swaggerUrl) {
      console.error('swaggerUrl is required! generate fail----');
      process.exit(1);
    }

    if (!outputPath) {
      console.error('swaggerUrl is required! generate fail----');
      process.exit(1);
    }

    console.log('generator api start---!')

    const swaggerData = await httpsgetJson(swaggerUrl);
    const { definitions = {}, paths = {}, tags = [] } = swaggerData || {};
    const pageMap = {};
    const refMap = {}; // 记录interface类型，防止重复
    // swagger tab页
    tags.forEach((tagObj) => {
      pageMap[tagObj.name] = { ...tagObj, paths: [] };
    });

    for (const path in paths) {
      currentData.path = path;
      const { tags, operationId, parameters, responses, summary } = paths[path].post || {};
      const currentTagName = tags?.[0];
      if (!currentTagName) {
        continue;
      }

      const fileName = clearStringSpace(pageMap[currentTagName].description);
      const currentPathData = {
        url: path,
        functionName: operationId,
        summary,
      };
      // 接口请求参数
      if (parameters?.[0]) {
        const { schema } = parameters[0];
        // POST
        const requestRef = schema?.originalRef ?? schema?.items?.originalRef;
        currentPathData.requestInterface = generatorInterface(requestRef, definitions, refMap, fileName);
        currentPathData.requestType = getTypesFromSwaggerType(schema);
      }
      // 接口返回参数
      if (responses) {
        const responseRef = responses[200]?.schema?.originalRef ?? responses[200]?.schema?.items?.originalRef;
        currentPathData.responseInterface = generatorInterface(responseRef, definitions, refMap, fileName);
        currentPathData.responseType = getTypesFromSwaggerType(responses[200]?.schema);
      }
      pageMap[currentTagName].paths.push(currentPathData);
    }

    /** 创建多级目录 */
    createNestedDirectories(outputPath);

    /** 遍历 创建文件&内容 */
    for (const page in pageMap) {
      if (pageMap[page].paths.length === 0) {
        continue;
      }
      const fileName = clearStringSpace(pageMap[page].description);
      const fileContent = pageMap[page].paths
        .map((data) => {
          const {
            url,
            functionName,
            summary,
            requestType,
            responseType,
            requestInterface,
            responseInterface,
          } = data;
          const featchApiFunction = generateFetchFunction({
            url,
            functionName,
            summary,
            requestType,
            responseType,
          });
          return `${requestInterface ?? ''}\n ${responseInterface ?? ''}\n ${featchApiFunction}`;
        })
        .join('\n');
      const fileHeaderContent = generatorFileHeadContent();
      // 自动格式化文件内容，使生成文件的内容格式统一
      const fileAllContent = await formatFile(`${fileHeaderContent} \n${fileContent}`)
      fs.writeFileSync(`${outputPath}/${fileName}.ts`, fileAllContent);
    }

    console.log('generator api success---!')
  } catch (error) {
    console.log(`Error reding file ${error} `, error, currentData);
  }
})();