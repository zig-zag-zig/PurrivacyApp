package vip.chi_chi.purrivacy.commit

import android.content.Context
import android.content.Intent
import android.view.autofill.AutofillManager
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableNativeMap

class AutofillCommitModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "AutofillCommitModule"
        private const val PREFS_NAME = "autofill_pending"
        private const val KEY_SEED = "seed"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun restartActivity(seed: String, username: String, password: String) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_SEED, seed)
            .putString(KEY_USERNAME, username)
            .putString(KEY_PASSWORD, password)
            .commit()
        Log.e("AutofillModule", "restartActivity: saved to prefs")
        UiThreadUtil.runOnUiThread {
            val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
            Log.e("AutofillModule", "restartActivity: finishing activity")
            activity.finish()
            val intent = activity.packageManager.getLaunchIntentForPackage(activity.packageName)
            if (intent != null) {
                activity.startActivity(intent)
                Log.e("AutofillModule", "restartActivity: launched new activity")
            }
        }
    }

    @ReactMethod
    fun commit() {
        val activity = reactApplicationContext.currentActivity ?: return
        UiThreadUtil.runOnUiThread {
            try {
                val am = reactApplicationContext.getSystemService(AutofillManager::class.java)
                if (am != null && am.isEnabled) {
                    am.commit()
                    Log.e("AutofillModule", "commit() called on enabled AutofillManager")
                } else {
                    Log.e("AutofillModule", "commit() manager=${am != null} enabled=${am?.isEnabled}")
                }
            } catch (e: Exception) {
                Log.e("AutofillModule", "commit() failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun consumePendingSignup(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val seed = prefs.getString(KEY_SEED, null)
        if (seed != null) {
            val map = WritableNativeMap()
            map.putString(KEY_SEED, seed)
            map.putString(KEY_USERNAME, prefs.getString(KEY_USERNAME, "") ?: "")
            map.putString(KEY_PASSWORD, prefs.getString(KEY_PASSWORD, "") ?: "")
            prefs.edit().clear().commit()
            Log.e("AutofillModule", "consumePendingSignup: returning data")
            promise.resolve(map)
        } else {
            Log.e("AutofillModule", "consumePendingSignup: no pending data")
            promise.resolve(null)
        }
    }
}
