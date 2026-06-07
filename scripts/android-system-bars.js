const {
  AndroidConfig,
  withAndroidManifest,
  withAndroidStyles,
  withGradleProperties,
} = require('expo/config-plugins');

const APP_THEME = AndroidConfig.Styles.getAppThemeGroup();
const SYSTEM_BAR_COLOR = '#121212';

function setStyleValue(styles, name, value, targetApi) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: APP_THEME,
    name,
    targetApi,
    value,
  });
}

function upsertGradleProperty(properties, key, value) {
  const existingProperty = properties.find(property => (
    property.type === 'property' && property.key === key
  ));

  if (existingProperty) {
    existingProperty.value = value;
    return properties;
  }

  return [
    ...properties,
    { type: 'property', key, value },
  ];
}

function withAndroidSoftInputMode(config) {
  return withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application?.[0];
    const mainActivity = application?.activity?.find(activity => (
      activity.$?.['android:name'] === '.MainActivity'
    ));

    if (mainActivity) {
      mainActivity.$ = mainActivity.$ || {};
      mainActivity.$['android:windowSoftInputMode'] = 'adjustResize';
    }

    return config;
  });
}

function withAndroidSystemBars(config) {
  config = withAndroidSoftInputMode(config);

  config = withAndroidStyles(config, config => {
    let styles = config.modResults;

    styles = setStyleValue(styles, 'android:statusBarColor', SYSTEM_BAR_COLOR);
    styles = setStyleValue(styles, 'android:navigationBarColor', SYSTEM_BAR_COLOR);
    styles = setStyleValue(styles, 'android:windowLightStatusBar', 'false');
    styles = setStyleValue(styles, 'android:windowLightNavigationBar', 'false');
    styles = setStyleValue(styles, 'android:windowOptOutEdgeToEdgeEnforcement', 'true', '35');

    config.modResults = styles;
    return config;
  });

  config = withGradleProperties(config, config => {
    config.modResults = upsertGradleProperty(
      config.modResults,
      'edgeToEdgeEnabled',
      'false',
    );
    return config;
  });

  return config;
}

module.exports = withAndroidSystemBars;
module.exports.plugin = withAndroidSystemBars;
