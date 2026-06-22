const { withProjectBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const basePackageName = 'vip.chi_chi.purrivacy';

function getAndroidPackageName(config) {
    return config.android?.package || basePackageName;
}

function getAndroidPackagePath(packageName) {
    return packageName.split('.');
}

function addKotlinImport(source, importPath) {
    if (source.includes(`import ${importPath}`)) {
        return source;
    }
    const importMatches = Array.from(source.matchAll(/^import .+$/gm));
    if (importMatches.length === 0) {
        return source.replace(/^package .+\n/, match => `${match}\nimport ${importPath}\n`);
    }
    const lastImport = importMatches[importMatches.length - 1];
    const insertIndex = lastImport.index + lastImport[0].length;
    return `${source.slice(0, insertIndex)}\nimport ${importPath}${source.slice(insertIndex)}`;
}

function addReactPackage(source, packageClassName) {
    if (
        source.includes(`add(${packageClassName}())`) ||
        source.includes(`packages.add(${packageClassName}())`)
    ) {
        return source;
    }
    const expoReactHostPattern = /(PackageList\(this\)\.packages\.apply\s*\{\n)/;
    if (expoReactHostPattern.test(source)) {
        return source.replace(expoReactHostPattern, `$1          add(${packageClassName}())\n`);
    }
    const classicReactNativeHostPattern = /(\s+)return packages/;
    if (classicReactNativeHostPattern.test(source)) {
        return source.replace(
            classicReactNativeHostPattern,
            `$1packages.add(${packageClassName}())\n$1return packages`,
        );
    }
    throw new Error(`Unable to register ${packageClassName} in MainApplication.kt`);
}

function withAndroidAutofillCommit(config) {
    return withProjectBuildGradle(config, async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const templateDir = path.join(projectRoot, 'scripts', 'autofill-commit-template');
        const packageName = getAndroidPackageName(config);
        const destDir = path.join(
            projectRoot,
            'android',
            'app',
            'src',
            'main',
            'java',
            ...getAndroidPackagePath(packageName),
        );

        try {
            fs.mkdirSync(destDir, { recursive: true });
            const files = fs.readdirSync(templateDir);
            for (const f of files) {
                const src = path.join(templateDir, f);
                const dst = path.join(destDir, f);
                let source = fs.readFileSync(src, 'utf8');
                source = source.replace(
                    new RegExp(`^package ${basePackageName.replace(/\./g, '\\.')}`, 'm'),
                    `package ${packageName}`,
                );
                fs.writeFileSync(dst, source, 'utf8');
            }

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
            mainApp = addKotlinImport(mainApp, `${packageName}.AutofillCommitPackage`);
            mainApp = addReactPackage(mainApp, 'AutofillCommitPackage');

            if (mainApp !== originalMainApp) {
                fs.writeFileSync(mainAppPath, mainApp, 'utf8');
            }
        } catch (e) {
            console.error('[autofill-commit-plugin] Failed to configure autofill commit module:', e);
            throw e;
        }

        return config;
    });
}

module.exports = withAndroidAutofillCommit;
module.exports.plugin = withAndroidAutofillCommit;
