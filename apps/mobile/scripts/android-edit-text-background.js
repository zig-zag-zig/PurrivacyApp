const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

const APP_THEME = AndroidConfig.Styles.getAppThemeGroup();

/**
 * Remove Android's native EditText background (the Material underline).
 *
 * `underlineColorAndroid="transparent"` only tints that drawable; on some
 * Fabric/New Architecture paths the tint is not applied, which leaves a dark
 * bottom rule inside fields on the dark theme. Every field in the app draws
 * its own wrapper/border, so the native background is never needed.
 */
function withAndroidEditTextBackground(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: APP_THEME,
      name: 'android:editTextBackground',
      value: '@null',
    });
    return config;
  });
}

module.exports = withAndroidEditTextBackground;
module.exports.plugin = withAndroidEditTextBackground;