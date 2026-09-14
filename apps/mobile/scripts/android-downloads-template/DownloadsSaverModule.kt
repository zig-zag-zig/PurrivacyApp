package vip.chi_chi.purrivacy.downloads

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream

/**
 * Saves an app-private output file (encrypted/decrypted result) into the
 * public Downloads/Purrivacy folder so the user can find it in any file
 * manager, instead of it only existing in the app cache where it can merely
 * be shared.
 *
 * Uses MediaStore (Android 10+) so no storage permission or folder picker is
 * required. Below API 29 the insert path is unavailable; callers fall back to
 * share/cache (the module rejects with UNSUPPORTED).
 */
class DownloadsSaverModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val MODULE_NAME = "PurrivacyDownloads"
        private const val SUBFOLDER = "Purrivacy"
        private const val DEFAULT_MIME = "application/octet-stream"
    }

    override fun getName() = MODULE_NAME

    @ReactMethod
    fun saveToDownloads(
        fileName: String,
        mimeType: String,
        sourceUri: String,
        promise: Promise,
    ) {
        if (fileName.isBlank() || sourceUri.isBlank()) {
            promise.reject("INVALID_INPUT", "fileName and sourceUri are required")
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("UNSUPPORTED", "Saving to Downloads requires Android 10 or newer")
            return
        }

        try {
            val resolver = reactContext.contentResolver
            val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
            val values =
                ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { DEFAULT_MIME })
                    put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + File.separator + SUBFOLDER,
                    )
                    // Hide the row until the bytes are fully written so other
                    // apps never observe a truncated file.
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }

            val item =
                resolver.insert(collection, values)
                    ?: throw IOException("MediaStore rejected the insert")

            try {
                resolver.openOutputStream(item).use { output ->
                    if (output == null) throw IOException("Could not open output stream for $fileName")
                    openSource(sourceUri).use { input -> input.copyTo(output) }
                }
                val published = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                resolver.update(item, published, null, null)
            } catch (e: Exception) {
                // Never leave a half-written pending row behind.
                runCatching { resolver.delete(item, null, null) }
                throw e
            }

            promise.resolve(item.toString())
        } catch (e: Exception) {
            promise.reject("SAVE_FAILED", e.message ?: "Failed to save file to Downloads", e)
        }
    }

    /** Open a saved result in whatever app handles its type (player, viewer…). */
    @ReactMethod
    fun openFile(
        uri: String,
        mimeType: String,
        promise: Promise,
    ) {
        if (uri.isBlank()) {
            promise.reject("INVALID_INPUT", "uri is required")
            return
        }

        try {
            val intent =
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.parse(uri), mimeType.ifBlank { DEFAULT_MIME })
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_FAILED", e.message ?: "No app can open this file", e)
        }
    }

    /**
     * Reveal the Downloads/Purrivacy folder. Android has no standard "reveal in
     * file manager" intent, so this is best-effort: try the DocumentsUI folder
     * view, then fall back to the system Downloads UI.
     */
    @ReactMethod
    fun showInFolder(promise: Promise) {
        try {
            val folderUri =
                Uri.parse(
                    "content://com.android.externalstorage.documents/document/primary%3A" +
                        Environment.DIRECTORY_DOWNLOADS + "%2F" + SUBFOLDER,
                )
            val folderIntent =
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(folderUri, DocumentsContract.Document.MIME_TYPE_DIR)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

            try {
                reactContext.startActivity(folderIntent)
                promise.resolve(true)
                return
            } catch (_: Exception) {
                // No handler for the folder URI — fall back to Downloads.
            }

            val downloadsIntent =
                Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            reactContext.startActivity(downloadsIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_FOLDER_FAILED", e.message ?: "Could not open Downloads", e)
        }
    }

    private fun openSource(sourceUri: String): InputStream {
        val uri = Uri.parse(sourceUri)
        return when (uri.scheme) {
            "content" ->
                reactContext.contentResolver.openInputStream(uri)
                    ?: throw IOException("Could not open $sourceUri")
            "file" ->
                FileInputStream(File(requireNotNull(uri.path) { "Missing path in $sourceUri" }))
            else -> FileInputStream(File(sourceUri))
        }
    }
}
