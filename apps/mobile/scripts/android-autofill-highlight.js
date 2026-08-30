const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

function withAndroidAutofillHighlight(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:autofilledHighlight',
      value: '@android:color/transparent',
    });
    return config;
  });
}

module.exports = withAndroidAutofillHighlight;
module.exports.plugin = withAndroidAutofillHighlight;
