const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(projectRoot, "shared"), path.resolve(projectRoot, "backend")];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.blockList = [/backend\/storage\/.*/, /backend\/test\/.*/];

module.exports = config;
