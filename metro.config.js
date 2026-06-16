const exclusionListModule = require('metro-config/private/defaults/exclusionList');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const exclusionList = exclusionListModule.default ?? exclusionListModule;

const defaultBlockList = config.resolver.blockList;
const nativeBuildPaths = [
  /ios\/Pods\/.*/,
  /ios\/build\/.*/,
  /ios\/DerivedData\/.*/,
  /android\/\.gradle\/.*/,
  /android\/build\/.*/,
  /android\/app\/build\/.*/,
];

config.resolver.blockList = Array.isArray(defaultBlockList)
  ? [...defaultBlockList, ...nativeBuildPaths]
  : exclusionList(defaultBlockList ? [defaultBlockList, ...nativeBuildPaths] : nativeBuildPaths);

module.exports = config;
