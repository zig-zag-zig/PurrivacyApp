const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Helper to get package name (matches your existing logic)
function getAndroidPackageName(config) {
    return config.android?.package || 'vip.chi_chi.purrivacy';
}

function getAndroidPackagePath(packageName) {
    return packageName.split('.');
}

// Helper to inject imports and packages into MainApplication.kt
function addKotlinImport(mainAppCode, importName) {
    const importStatement = `import ${importName}`;
    if (mainAppCode.includes(importStatement)) return mainAppCode;
    const lines = mainAppCode.split('\n');
    const lastImportIndex = lines.findLastIndex(line => line.trim().startsWith('import '));
    if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, importStatement);
    } else {
        lines.unshift(importStatement);
    }
    return lines.join('\n');
}

function addReactPackage(mainAppCode, packageName) {
    const packageAddition = `add(${packageName}())`;
    if (mainAppCode.includes(packageAddition)) return mainAppCode;

    // Matches the new Expo SDK 56+ New Architecture syntax
    const regex = /PackageList\(this\)\.packages\.apply\s*\{([\s\S]*?)\}/;
    const match = mainAppCode.match(regex);

    if (match) {
        const existingAdds = match[1];
        if (!existingAdds.includes(packageAddition)) {
            // Injects cleanly at the top of the apply block
            const newBlock = match[0].replace(match[1], `\n          ${packageAddition}${existingAdds}`);
            return mainAppCode.replace(match[0], newBlock);
        }
    }
    return mainAppCode;
}

function withAndroidIsolatedInput(config) {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const templateDir = path.join(projectRoot, 'scripts', 'isolated-input-template');
            const packageName = getAndroidPackageName(config);
            const basePackageName = 'vip.chi_chi.purrivacy';

            const destDir = path.join(
                projectRoot,
                'android',
                'app',
                'src',
                'main',
                'java',
                ...getAndroidPackagePath(packageName),
                'isolated'
            );

            try {
                fs.mkdirSync(destDir, { recursive: true });
                const files = fs.readdirSync(templateDir);

                for (const f of files) {
                    const src = path.join(templateDir, f);
                    const dst = path.join(destDir, f);
                    let source = fs.readFileSync(src, 'utf8');

                    // Dynamically rewrite the package name to match the current build variant
                    source = source.replace(
                        new RegExp(`^package ${basePackageName.replace(/\./g, '\\.')}\.isolated`, 'm'),
                        `package ${packageName}.isolated`
                    );

                    fs.writeFileSync(dst, source, 'utf8');
                }

                // Patch MainApplication.kt
                const mainAppPath = path.join(
                    projectRoot,
                    'android',
                    'app',
                    'src',
                    'main',
                    'java',
                    ...getAndroidPackagePath(packageName),
                    'MainApplication.kt'
                );

                let mainApp = fs.readFileSync(mainAppPath, 'utf8');
                const originalMainApp = mainApp;

                mainApp = addKotlinImport(mainApp, `${packageName}.isolated.IsolatedInputPackage`);
                mainApp = addReactPackage(mainApp, 'IsolatedInputPackage');

                if (mainApp !== originalMainApp) {
                    fs.writeFileSync(mainAppPath, mainApp, 'utf8');
                }
            } catch (e) {
                console.error('[isolated-input-plugin] Failed to configure isolated input module:', e);
                throw e;
            }

            return config;
        },
    ]);
}

module.exports = withAndroidIsolatedInput;