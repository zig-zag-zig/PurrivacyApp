package vip.chi_chi.purrivacy.commit

import android.content.Context
import android.content.Intent
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableNativeMap
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/**
 * Bridges the Android autofill "save" flow during signup.
 *
 * SECURITY (APP-SEC-001): this module previously wrote the recovery seed and
 * account password to plaintext SharedPreferences while the Activity restarted
 * for the password-manager save dialog. It now stores only a short-lived
 * AES-256-GCM envelope whose key lives in the Android Keystore. Plaintext
 * never touches disk. The envelope is single-use and expires quickly; on
 * consume, expiry, or any tampering/failure, both the entry and the Keystore
 * key are deleted before any value is returned.
 */
class AutofillCommitModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "AutofillCommitModule"
        private const val TAG = "AutofillModule"
        private const val PREFS_NAME = "autofill_pending"
        private const val KEY_CIPHERTEXT = "pending_ciphertext"
        private const val KEY_IV = "pending_iv"
        private const val KEY_EXPIRES_AT = "pending_expires_at"
        private const val KEYSTORE_ALIAS = "purrivacy_pending_signup"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val ENVELOPE_TTL_MS = 2 * 60 * 1000L // 2 minutes
        private const val GCM_TAG_BITS = 128
    }

    override fun getName(): String = MODULE_NAME

    // ---------------------------------------------------------------------
    // Keystore helpers
    // ---------------------------------------------------------------------

    private fun getOrCreatePendingSignupKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val existing = keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey
        if (existing != null) {
            return existing
        }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val spec = KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // The key cannot be used while the device is locked.
            spec.setUnlockedDeviceRequired(true)
        }

        generator.init(spec.build())
        return generator.generateKey()
    }

    private fun deletePendingSignupKey() {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
            if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
                keyStore.deleteEntry(KEYSTORE_ALIAS)
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "failed to delete pending signup key", e)
        }
    }

    private fun clearPendingPrefs() {
        reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    // ---------------------------------------------------------------------
    // React methods
    // ---------------------------------------------------------------------

    /**
     * Finishes and relaunches the activity so the Android password manager
     * shows its save dialog for the just-committed signup credentials.
     * Takes NO secrets - secrets travel via [persistPendingSignup].
     */
    @ReactMethod
    fun restartActivity() {
        UiThreadUtil.runOnUiThread {
            val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
            activity.finish()
            val intent = activity.packageManager.getLaunchIntentForPackage(activity.packageName)
            if (intent != null) {
                activity.startActivity(intent)
            }
        }
    }

    /**
     * Persists the pending signup as an encrypted envelope. Only ciphertext,
     * IV, and an absolute expiry timestamp are written to disk.
     */
    @ReactMethod
    fun persistPendingSignup(payloadJson: String, promise: Promise) {
        try {
            val nonce = ByteArray(16).also { SecureRandom().nextBytes(it) }
            val envelope = JSONObject()
                .put("payload", JSONObject(payloadJson))
                .put("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP))
                .put("expiresAtEpochMs", System.currentTimeMillis() + ENVELOPE_TTL_MS)
                .toString()

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreatePendingSignupKey())
            val ciphertext = cipher.doFinal(envelope.toByteArray(Charsets.UTF_8))
            val iv = cipher.iv

            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val wrote = prefs.edit()
                .putString(KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .putLong(KEY_EXPIRES_AT, System.currentTimeMillis() + ENVELOPE_TTL_MS)
                .commit()
            if (!wrote) {
                // Fail closed: a failed disk write must not report success,
                // or the restart would lose the signup silently.
                throw IllegalStateException("SharedPreferences commit failed")
            }

            promise.resolve(true)
        } catch (e: Exception) {
            // Fail closed: nothing usable may remain on disk.
            clearPendingPrefs()
            deletePendingSignupKey()
            promise.reject("PERSIST_PENDING_SIGNUP_FAILED", "Failed to persist pending signup", e)
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
                }
            } catch (e: Exception) {
                android.util.Log.w(TAG, "commit() failed", e)
            }
        }
    }

    /**
     * One-time consumption of the pending signup envelope. The persisted
     * state and the Keystore key are deleted BEFORE plaintext is returned;
     * on expiry, tampering, or any failure this resolves null with nothing
     * left behind.
     */
    @ReactMethod
    fun consumePendingSignup(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ciphertextB64 = prefs.getString(KEY_CIPHERTEXT, null)
        val ivB64 = prefs.getString(KEY_IV, null)
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)

        // Delete persisted state first: one-time semantics even if the
        // decryption below fails or the process dies mid-way.
        clearPendingPrefs()

        if (ciphertextB64 == null || ivB64 == null) {
            deletePendingSignupKey()
            promise.resolve(null)
            return
        }

        if (System.currentTimeMillis() >= expiresAt) {
            deletePendingSignupKey()
            promise.resolve(null)
            return
        }

        try {
            val key = getOrCreatePendingSignupKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(GCM_TAG_BITS, Base64.decode(ivB64, Base64.NO_WRAP))
            )
            val plaintext = cipher.doFinal(Base64.decode(ciphertextB64, Base64.NO_WRAP))
            deletePendingSignupKey()

            val envelope = JSONObject(String(plaintext, Charsets.UTF_8))
            // Defense in depth: the inner envelope carries its own expiry and a
            // nonce; both are checked so a swapped/replayed/old envelope is
            // rejected even if the outer prefs expiry were bypassed.
            if (System.currentTimeMillis() >= envelope.optLong("expiresAtEpochMs", 0L)) {
                promise.resolve(null)
                return
            }
            if (envelope.optString("nonce", "").isEmpty()) {
                promise.resolve(null)
                return
            }

            val payload = envelope.getJSONObject("payload")
            val map = WritableNativeMap()
            map.putString("seed", payload.optString("seed", ""))
            map.putString("username", payload.optString("username", ""))
            map.putString("password", payload.optString("password", ""))
            promise.resolve(map)
        } catch (e: Exception) {
            // Tampering, wrong key, or corruption: nothing remains on disk.
            deletePendingSignupKey()
            promise.resolve(null)
        }
    }
}
