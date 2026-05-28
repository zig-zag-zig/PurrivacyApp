package vip.chi_chi.purrivacy.shareIntent

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class ShareIntentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun getInitialShare(promise: Promise) {
        promise.resolve(readShareIntent(reactContext.currentActivity?.intent))
    }

    @ReactMethod
    fun clearShare(promise: Promise) {
        reactContext.currentActivity?.intent?.let(::clearShareExtras)
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter.
    }

    override fun onNewIntent(intent: Intent) {
        readShareIntent(intent)?.let { payload ->
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_NAME, payload)
            }
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) = Unit

    private fun readShareIntent(intent: Intent?): WritableMap? {
        if (intent == null || !isSupportedShareAction(intent.action)) {
            return null
        }

        val mimeType = intent.type.orEmpty()
        if (mimeType.isNotBlank() && !mimeType.startsWith("text/")) {
            return null
        }

        val text = when (intent.action) {
            Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        }?.takeIf { it.isNotBlank() } ?: return null

        return Arguments.createMap().apply {
            putString("text", text)
            putString("action", intent.action)
            putString("mimeType", mimeType)
        }
    }

    private fun clearShareExtras(intent: Intent) {
        intent.removeExtra(Intent.EXTRA_TEXT)
        intent.removeExtra(Intent.EXTRA_PROCESS_TEXT)
        intent.removeExtra(Intent.EXTRA_SUBJECT)
    }

    private fun isSupportedShareAction(action: String?): Boolean =
        action == Intent.ACTION_SEND || action == Intent.ACTION_PROCESS_TEXT

    companion object {
        const val MODULE_NAME = "PurrivacyShareIntent"
        const val EVENT_NAME = "PurrivacyShareIntent"
    }
}
