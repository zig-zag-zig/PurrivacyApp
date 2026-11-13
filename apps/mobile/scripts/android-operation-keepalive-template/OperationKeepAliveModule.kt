package vip.chi_chi.purrivacy.operations

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OperationKeepAliveModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val MODULE_NAME = "PurrivacyOperationKeepAlive"
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun startKeepAlive(title: String, detail: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, OperationKeepAliveService::class.java).apply {
                action = OperationKeepAliveService.ACTION_START_OR_UPDATE
                putExtra(OperationKeepAliveService.EXTRA_TITLE, title)
                putExtra(OperationKeepAliveService.EXTRA_DETAIL, detail)
            }
            ContextCompat.startForegroundService(reactContext, intent)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun updateKeepAlive(title: String, detail: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, OperationKeepAliveService::class.java).apply {
                action = OperationKeepAliveService.ACTION_START_OR_UPDATE
                putExtra(OperationKeepAliveService.EXTRA_TITLE, title)
                putExtra(OperationKeepAliveService.EXTRA_DETAIL, detail)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun stopKeepAlive(promise: Promise) {
        try {
            val stopIntent = Intent(reactContext, OperationKeepAliveService::class.java).apply {
                action = OperationKeepAliveService.ACTION_STOP
            }
            runCatching { reactContext.startService(stopIntent) }
            reactContext.stopService(Intent(reactContext, OperationKeepAliveService::class.java))
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }
}
