const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Monorepo root so Metro can resolve @purrivacy/shared (packages/shared)
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.unstable_enablePackageExports = false;

// Expo monorepo pattern: watch shared packages, single-root node_modules
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    buffer: require.resolve('buffer/'),
};

module.exports = config;