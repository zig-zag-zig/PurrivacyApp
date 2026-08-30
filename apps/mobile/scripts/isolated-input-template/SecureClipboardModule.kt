package vip.chi_chi.purrivacy.isolated

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = SecureClipboardModule.NAME)
class SecureClipboardModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "SecureClipboard"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun copySecure(text: String) {
        val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Secure Data", text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val extras = PersistableBundle()
            extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
            clip.description.extras = extras
        }
        clipboard.setPrimaryClip(clip)
    }

    @ReactMethod
    fun clearClipboard() {
        val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
    }

    /**
     * Conditional wipe (APP-SEC-005): only clears the primary clip when it still
     * holds the exact value this app copied. Never clobbers a newer copy the user
     * made afterwards (e.g. from another app).
     */
    @ReactMethod
    fun clearClipboardIfMatches(text: String) {
        val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val currentClip = clipboard.primaryClip ?: return
        if (currentClip.itemCount == 0) return
        val currentText = currentClip.getItemAt(0).coerceToText(reactApplicationContext).toString()
        if (currentText == text) {
            clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
        }
    }
}
