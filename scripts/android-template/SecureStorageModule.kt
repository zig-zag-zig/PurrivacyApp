package vip.chi_chi.purrivacy.secureStorage

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.facebook.react.bridge.*
import java.security.KeyStore
import java.util.concurrent.Executor
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStorageModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val MODULE_NAME = "SecureStorageModule"
        private const val ERROR_DELETE_VERIFICATION = "DELETE_VERIFICATION_ERROR"
        private const val ERROR_KEYSTORE_INIT = "KEYSTORE_INIT_ERROR"
    }

    override fun getName() = MODULE_NAME

    // region 1. Encrypted Storage with corruption recovery
    private var encryptedPrefs: SharedPreferences? = null

    private fun getEncryptedPrefs(): SharedPreferences {
        synchronized(this) {
            if (encryptedPrefs == null) {
                val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                encryptedPrefs =
                    EncryptedSharedPreferences.create(
                        "SecureStoragePrefs",
                        masterKeyAlias,
                        reactContext,
                        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                    )
            }
            return encryptedPrefs!!
        }
    }

    private fun createResponseWithLogs(
        success: Boolean = true,
        value: String? = null,
        logs: List<String> = emptyList(),
    ): WritableNativeMap =
        WritableNativeMap().apply {
            putBoolean("success", success)
            value?.let { putString("value", it) }
            val logsArray = WritableNativeArray()
            logs.forEach { logsArray.pushString(it) }
            putArray("logs", logsArray)
        }

    private fun createErrorResponse(
        code: String,
        message: String,
        logs: List<String> = emptyList(),
        additionalInfo: Map<String, String> = emptyMap(),
    ): WritableNativeMap =
        WritableNativeMap().apply {
            putString("code", code)
            putBoolean("success", false)
            putString("message", message)
            val logsArray = WritableNativeArray()
            logs.forEach { logsArray.pushString(it) }
            putArray("logs", logsArray)
            val infoMap = WritableNativeMap()
            additionalInfo.forEach { (key, value) -> infoMap.putString(key, value) }
            putMap("info", infoMap)
        }

    @ReactMethod
    fun setSensitiveValue(
        key: String,
        value: String,
        promise: Promise,
    ) {
        val logs = mutableListOf<String>()

        if (key.isBlank() || value.isBlank()) {
            val errorResponse =
                createErrorResponse(
                    "INVALID_INPUT",
                    "Key and value cannot be empty",
                    logs,
                    mapOf("key" to key, "operation" to "setSensitiveValue"),
                )
            promise.resolve(errorResponse)
            return
        }

        try {
            logs.add("Attempting to set value for key: $key (length: ${value.length})")
            getEncryptedPrefs().edit().putString(key, value).apply()
            logs.add("Successfully stored value for key: $key")

            val response = createResponseWithLogs(success = true, logs = logs)
            promise.resolve(response)
        } catch (e: Throwable) {
            logs.add("Failed to set value for key: $key: ${e.message}")
            logs.add("Error type: ${e.javaClass.simpleName}")

            val errorResponse =
                createErrorResponse(
                    "SET_DATA_ERROR",
                    "Failed to store data: ${e.message}",
                    logs,
                    mapOf(
                        "key" to key,
                        "valueLength" to value.length.toString(),
                        "operation" to "setSensitiveValue",
                        "errorType" to e.javaClass.simpleName,
                        "stackTrace" to e.stackTraceToString(),
                    ),
                )
            promise.resolve(errorResponse)
        }
    }

    @ReactMethod
    fun getSensitiveValue(
        key: String,
        promise: Promise,
    ) {
        val logs = mutableListOf<String>()

        if (key.isBlank()) {
            val errorResponse =
                createErrorResponse(
                    "INVALID_INPUT",
                    "Key cannot be empty",
                    logs,
                    mapOf("key" to key, "operation" to "getSensitiveValue"),
                )
            promise.resolve(errorResponse)
            return
        }

        try {
            logs.add("Attempting to get value for key: $key")
            val value = getEncryptedPrefs().getString(key, null)

            if (value != null) {
                logs.add("Successfully retrieved value for key: $key (length: ${value.length})")
                val response = createResponseWithLogs(success = true, value = value, logs = logs)
                promise.resolve(response)
            } else {
                logs.add("No value found for key: $key")
                val response = createResponseWithLogs(success = true, value = null, logs = logs)
                promise.resolve(response)
            }
        } catch (e: Throwable) {
            logs.add("Error reading key $key: ${e.message}")
            logs.add("Error type: ${e.javaClass.simpleName}")

            val errorResponse =
                createErrorResponse(
                    "SECURE_STORAGE_ERROR",
                    "Failed to get value: ${e.message}",
                    logs,
                    mapOf(
                        "key" to key,
                        "operation" to "getSensitiveValue",
                        "errorType" to e.javaClass.simpleName,
                        "stackTrace" to e.stackTraceToString(),
                    ),
                )
            promise.resolve(errorResponse)
        }
    }

    @ReactMethod
    fun deleteSensitiveValue(
        key: String,
        promise: Promise,
    ) {
        val logs = mutableListOf<String>()

        if (key.isBlank()) {
            val errorResponse =
                createErrorResponse(
                    "INVALID_INPUT",
                    "Key cannot be empty",
                    logs,
                    mapOf("key" to key, "operation" to "deleteSensitiveValue"),
                )
            promise.resolve(errorResponse)
            return
        }

        try {
            logs.add("Attempting to delete value for key: $key")
            getEncryptedPrefs().edit().remove(key).apply()
            logs.add("Successfully deleted value for key: $key")

            val response = createResponseWithLogs(success = true, logs = logs)
            promise.resolve(response)
        } catch (e: Throwable) {
            logs.add("Error deleting key $key: ${e.message}")
            logs.add("Error type: ${e.javaClass.simpleName}")

            val errorResponse =
                createErrorResponse(
                    "DELETE_DATA_ERROR",
                    "Failed to delete data: ${e.message}",
                    logs,
                    mapOf(
                        "key" to key,
                        "operation" to "deleteSensitiveValue",
                        "errorType" to e.javaClass.simpleName,
                        "stackTrace" to e.stackTraceToString(),
                    ),
                )
            promise.resolve(errorResponse)
        }
    }

    // region 2. Biometric-backed local keys

    @ReactMethod
    fun deleteBiometricKey(
        key: String,
        promise: Promise,
    ) {
        if (key.isBlank()) {
            promise.reject("INVALID_INPUT", "Key cannot be empty")
            return
        }
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

            if (ks.containsAlias(key)) {
                ks.deleteEntry(key)
                Thread.sleep(50)
                ks.load(null)
                if (!ks.containsAlias(key)) {
                    promise.resolve(true)
                } else {
                    promise.reject(
                        ERROR_DELETE_VERIFICATION,
                        "Key still exists after deletion attempt",
                    )
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("KEYSTORE_ACCESS_ERROR", "KeyStore access failed: ${e.message}")
        }
    }

    private fun generateBiometricSecretKeyIfNeeded(key: String): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (ks.containsAlias(key)) {
            return ks.getKey(key, null) as SecretKey
        }

        val spec =
            KeyGenParameterSpec
                .Builder(
                    key,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true)
                .build()

        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(spec)
        generator.generateKey()

        val reloaded = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return reloaded.getKey(key, null) as SecretKey
    }

    private fun getBiometricSecretKey(key: String): SecretKey? {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return ks.getKey(key, null) as? SecretKey
    }

    private fun rejectBiometricAuthError(
        promise: Promise,
        errorCode: Int,
        errString: CharSequence,
    ) {
        when (errorCode) {
            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
            BiometricPrompt.ERROR_USER_CANCELED,
            BiometricPrompt.ERROR_CANCELED,
            -> {
                promise.reject("AUTH_CANCELLED", "Authentication cancelled")
            }

            BiometricPrompt.ERROR_LOCKOUT -> {
                promise.reject("AUTH_LOCKOUT", "Too many failed attempts")
            }

            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> {
                promise.reject("AUTH_LOCKOUT_PERMANENT", "Biometric permanently locked")
            }

            else -> {
                promise.reject("AUTH_ERROR", errString.toString())
            }
        }
    }

    @ReactMethod
    fun authenticateBiometric(
        promptMessage: String,
        promise: Promise,
    ) {
        if (promptMessage.isBlank()) {
            promise.reject("INVALID_INPUT", "Prompt message is required")
            return
        }

        val activity =
            reactContext.currentActivity as? FragmentActivity
                ?: run {
                    promise.reject("NO_ACTIVITY", "No active activity found")
                    return
                }

        activity.runOnUiThread {
            try {
                val promptInfo =
                    BiometricPrompt.PromptInfo
                        .Builder()
                        .setTitle(promptMessage)
                        .setConfirmationRequired(false)
                        .setNegativeButtonText("Cancel")
                        .setAllowedAuthenticators(
                            BiometricManager.Authenticators.BIOMETRIC_STRONG,
                        ).build()
                val executor: Executor = ContextCompat.getMainExecutor(reactContext)

                val biometricPrompt =
                    BiometricPrompt(
                        activity,
                        executor,
                        object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                promise.resolve(true)
                            }

                            override fun onAuthenticationError(
                                errorCode: Int,
                                errString: CharSequence,
                            ) {
                                rejectBiometricAuthError(promise, errorCode, errString)
                            }
                        },
                    )

                biometricPrompt.authenticate(promptInfo)
            } catch (e: Exception) {
                promise.reject("BIOMETRIC_AUTH_ERROR", "Failed to start biometric authentication")
            }
        }
    }

    @ReactMethod
    fun setBiometricProtectedValue(
        key: String,
        storageKey: String,
        value: String,
        promptMessage: String,
        promise: Promise,
    ) {
        if (key.isBlank() || storageKey.isBlank() || value.isBlank() || promptMessage.isBlank()) {
            promise.reject("INVALID_INPUT", "Key, storage key, value, and prompt message are required")
            return
        }

        val activity =
            reactContext.currentActivity as? FragmentActivity
                ?: run {
                    promise.reject("NO_ACTIVITY", "No active activity found")
                    return
                }

        activity.runOnUiThread {
            try {
                val secretKey = generateBiometricSecretKeyIfNeeded(key)
                val cipher =
                    Cipher.getInstance("AES/GCM/NoPadding").apply {
                        init(Cipher.ENCRYPT_MODE, secretKey)
                    }
                val cryptoObject = BiometricPrompt.CryptoObject(cipher)
                val promptInfo =
                    BiometricPrompt.PromptInfo
                        .Builder()
                        .setTitle(promptMessage)
                        .setConfirmationRequired(false)
                        .setNegativeButtonText("Cancel")
                        .setAllowedAuthenticators(
                            BiometricManager.Authenticators.BIOMETRIC_STRONG,
                        ).build()
                val executor: Executor = ContextCompat.getMainExecutor(reactContext)

                val biometricPrompt =
                    BiometricPrompt(
                        activity,
                        executor,
                        object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                try {
                                    val authedCipher =
                                        result.cryptoObject?.cipher
                                            ?: throw IllegalStateException(
                                                "Missing cipher",
                                            )
                                    val encrypted =
                                        authedCipher.doFinal(value.toByteArray(Charsets.UTF_8))
                                    val storedValue =
                                        Base64.encodeToString(
                                            authedCipher.iv,
                                            Base64.NO_WRAP,
                                        ) +
                                            ":" +
                                            Base64.encodeToString(
                                                encrypted,
                                                Base64.NO_WRAP,
                                            )
                                    getEncryptedPrefs()
                                        .edit()
                                        .putString(storageKey, storedValue)
                                        .apply()
                                    promise.resolve(createResponseWithLogs(success = true))
                                } catch (e: Exception) {
                                    promise.reject(
                                        "BIOMETRIC_STORE_ERROR",
                                        "Failed to store protected value",
                                    )
                                }
                            }

                            override fun onAuthenticationError(
                                errorCode: Int,
                                errString: CharSequence,
                            ) {
                                rejectBiometricAuthError(promise, errorCode, errString)
                            }
                        },
                    )

                biometricPrompt.authenticate(promptInfo, cryptoObject)
            } catch (e: Exception) {
                promise.reject("BIOMETRIC_STORE_ERROR", "Failed to start biometric storage")
            }
        }
    }

    @ReactMethod
    fun getBiometricProtectedValue(
        key: String,
        storageKey: String,
        promptMessage: String,
        promise: Promise,
    ) {
        if (key.isBlank() || storageKey.isBlank() || promptMessage.isBlank()) {
            promise.reject("INVALID_INPUT", "Key, storage key, and prompt message are required")
            return
        }

        val storedValue = getEncryptedPrefs().getString(storageKey, null)
        if (storedValue == null) {
            promise.resolve(createResponseWithLogs(success = true, value = null))
            return
        }

        val activity =
            reactContext.currentActivity as? FragmentActivity
                ?: run {
                    promise.reject("NO_ACTIVITY", "No active activity found")
                    return
                }

        activity.runOnUiThread {
            try {
                val parts = storedValue.split(":", limit = 2)
                if (parts.size != 2) {
                    promise.reject("INVALID_PROTECTED_VALUE", "Stored protected value is invalid")
                    return@runOnUiThread
                }

                val secretKey =
                    getBiometricSecretKey(key)
                        ?: run {
                            promise.reject("KEY_NOT_FOUND", "Biometric value key not found")
                            return@runOnUiThread
                        }
                val iv = Base64.decode(parts[0], Base64.NO_WRAP)
                val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
                val cipher =
                    Cipher.getInstance("AES/GCM/NoPadding").apply {
                        init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
                    }
                val cryptoObject = BiometricPrompt.CryptoObject(cipher)
                val promptInfo =
                    BiometricPrompt.PromptInfo
                        .Builder()
                        .setTitle(promptMessage)
                        .setConfirmationRequired(false)
                        .setNegativeButtonText("Cancel")
                        .setAllowedAuthenticators(
                            BiometricManager.Authenticators.BIOMETRIC_STRONG,
                        ).build()
                val executor: Executor = ContextCompat.getMainExecutor(reactContext)

                val biometricPrompt =
                    BiometricPrompt(
                        activity,
                        executor,
                        object : BiometricPrompt.AuthenticationCallback() {
                            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                                try {
                                    val authedCipher =
                                        result.cryptoObject?.cipher
                                            ?: throw IllegalStateException(
                                                "Missing cipher",
                                            )
                                    val decrypted = authedCipher.doFinal(encrypted)
                                    val value = String(decrypted, Charsets.UTF_8)
                                    promise.resolve(
                                        createResponseWithLogs(
                                            success = true,
                                            value = value,
                                        ),
                                    )
                                } catch (e: Exception) {
                                    promise.reject(
                                        "BIOMETRIC_READ_ERROR",
                                        "Failed to read protected value",
                                    )
                                }
                            }

                            override fun onAuthenticationError(
                                errorCode: Int,
                                errString: CharSequence,
                            ) {
                                rejectBiometricAuthError(promise, errorCode, errString)
                            }
                        },
                    )

                biometricPrompt.authenticate(promptInfo, cryptoObject)
            } catch (e: Exception) {
                promise.reject("BIOMETRIC_READ_ERROR", "Failed to start biometric read")
            }
        }
    }

    // region 3. Cleartext SharedPreferences
    private val cleartextPrefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("CleartextPrefs", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun setValue(
        key: String,
        value: String,
        promise: Promise,
    ) {
        if (key.isBlank() || value.isBlank()) {
            promise.reject("INVALID_INPUT", "Key and value cannot be empty")
            return
        }
        cleartextPrefs.edit().putString(key, value).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun getValue(
        key: String,
        promise: Promise,
    ) {
        if (key.isBlank()) {
            promise.reject("INVALID_INPUT", "Key cannot be empty")
            return
        }
        promise.resolve(cleartextPrefs.getString(key, null))
    }

    @ReactMethod
    fun deleteValue(
        key: String,
        promise: Promise,
    ) {
        if (key.isBlank()) {
            promise.reject("INVALID_INPUT", "Key cannot be empty")
            return
        }
        cleartextPrefs.edit().remove(key).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun isBiometricAvailable(promise: Promise) {
        try {
            val biometricManager = BiometricManager.from(reactContext)
            val status =
                biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG,
                )

            val hasHardware =
                when (status) {
                    BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> false
                    BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> false
                    else -> true
                }

            promise.resolve(hasHardware)
        } catch (e: Exception) {
            promise.reject(
                "BIOMETRIC_HARDWARE_ERROR",
                "Biometric available check failed: ${e.message ?: "Unknown error"}",
            )
        }
    }

    @ReactMethod
    fun isBiometricEnabledInApp(
        key: String,
        promise: Promise,
    ) {
        if (key.isBlank()) {
            promise.reject("INVALID_INPUT", "Key cannot be empty")
            return
        }
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val exists = ks.containsAlias(key)
            promise.resolve(exists)
        } catch (e: Exception) {
            promise.reject(ERROR_KEYSTORE_INIT, "KeyStore initialization failed: ${e.message}")
        }
    }

    @ReactMethod
    fun isBiometricEnabledOnPhone(promise: Promise) {
        try {
            val biometricManager = BiometricManager.from(reactContext)
            val status =
                biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG,
                )

            val isAvailable = status == BiometricManager.BIOMETRIC_SUCCESS
            promise.resolve(isAvailable)
        } catch (e: Exception) {
            promise.reject(
                "BIOMETRIC_CHECK_ERROR",
                "Biometric enabled on phone check failed: ${e.message ?: "Unknown error"}",
            )
        }
    }

    @ReactMethod
    fun canRequestPackageInstalls(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
                return
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "PACKAGE_INSTALL_PERMISSION_ERROR",
                "Failed to check package install permission: ${e.message ?: "Unknown error"}",
            )
        }
    }

    @ReactMethod
    fun openInstallPermissionSettings(promise: Promise) {
        try {
            val intent =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${reactContext.packageName}"),
                    )
                } else {
                    Intent(Settings.ACTION_SECURITY_SETTINGS)
                }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val fallbackIntent =
                    Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                reactContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (fallbackError: Exception) {
                promise.reject(
                    "OPEN_INSTALL_SETTINGS_ERROR",
                    "Failed to open install settings: ${fallbackError.message ?: e.message ?: "Unknown error"}",
                )
            }
        }
    }

    @ReactMethod
    fun installApk(
        contentUri: String,
        promise: Promise,
    ) {
        if (contentUri.isBlank()) {
            promise.reject("INVALID_INPUT", "APK URI is required")
            return
        }

        try {
            val intent =
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.parse(contentUri), "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "INSTALL_APK_ERROR",
                "Failed to open APK installer: ${e.message ?: "Unknown error"}",
            )
        }
    }
}
