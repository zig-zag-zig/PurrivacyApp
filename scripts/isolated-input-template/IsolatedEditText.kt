package vip.chi_chi.purrivacy.isolated

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.os.PersistableBundle
import android.text.method.PasswordTransformationMethod
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.views.textinput.ReactEditText

class IsolatedEditText(
    context: ThemedReactContext,
) : ReactEditText(context) {
    private var isolatedSecureTextEntry = false
    private var lastKeyboardVisible = false

    // Must be declared BEFORE init{} — Kotlin initializes properties and init
    // blocks in declaration order. Referencing it in init before this line
    // causes "Variable must be initialized" compile error.
    private val keyboardLayoutListener =
        ViewTreeObserver.OnGlobalLayoutListener {
            val rect = Rect()
            getWindowVisibleDisplayFrame(rect)
            val screenHeight = resources.displayMetrics.heightPixels
            val keypadHeight = screenHeight - rect.bottom
            val keyboardVisible = keypadHeight > screenHeight * 0.15

            if (lastKeyboardVisible && !keyboardVisible && hasFocus()) {
                Log.d("ISOLATED_NATIVE", "keyboardLayoutListener: keyboard hidden, keeping focus")
            } else if (lastKeyboardVisible != keyboardVisible) {
                Log.d("ISOLATED_NATIVE", "keyboardLayoutListener: keyboardVisible=" + keyboardVisible + " hasFocus=" + hasFocus())
            }
            lastKeyboardVisible = keyboardVisible
        }

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        viewTreeObserver.addOnGlobalLayoutListener(keyboardLayoutListener)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnGlobalLayoutListener(keyboardLayoutListener)
        super.onDetachedFromWindow()
    }

    // Telling Android this view is always a text editor makes the focus
    // transfer between EditText instances seamless — Android keeps the
    // keyboard open during the transfer instead of hiding it globally.
    override fun onCheckIsTextEditor(): Boolean = true

    override fun onFocusChanged(
        focused: Boolean,
        direction: Int,
        previouslyFocusedRect: android.graphics.Rect?,
    ) {
        Log.d("ISOLATED_NATIVE", "onFocusChanged: focused=" + focused)
        super.onFocusChanged(focused, direction, previouslyFocusedRect)
        if (focused) {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            imm.showSoftInput(this, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
        }
        // Do NOT call hideSoftInputFromWindow on focus loss — that would
        // flicker the keyboard on field transitions. Tap-outside dismissal
        // is handled by blurAllIsolatedInputs + Keyboard.dismiss() in JS.
    }

    override fun onTouchEvent(event: android.view.MotionEvent): Boolean {
        when (event.action) {
            android.view.MotionEvent.ACTION_DOWN -> {
                Log.d("ISOLATED_NATIVE", "onTouchEvent ACTION_DOWN hasFocus=" + hasFocus())
                // Request focus immediately on DOWN instead of waiting for the
                // default UP-based focus. This ensures focus transfers to this
                // input before the standard field's blur can hide the keyboard,
                // eliminating the keyboard close/reopen flicker on standard->passphrase.
                if (!hasFocus()) {
                    requestFocus()
                }
            }
            android.view.MotionEvent.ACTION_UP -> Log.d("ISOLATED_NATIVE", "onTouchEvent ACTION_UP hasFocus=" + hasFocus())
        }
        return super.onTouchEvent(event)
    }

    fun setIsolatedSecureTextEntry(secure: Boolean) {
        val hadFocus = hasFocus()
        isolatedSecureTextEntry = secure
        applySecureTransformation()
        if (hadFocus) {
            post {
                if (!hasFocus()) {
                    requestFocus()
                }
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                imm.showSoftInput(this, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
            }
        }
    }

    private fun applySecureTransformation() {
        val selStart = selectionStart
        val selEnd = selectionEnd
        transformationMethod =
            if (isolatedSecureTextEntry) {
                PasswordTransformationMethod.getInstance()
            } else {
                null
            }
        if (selStart >= 0 && selEnd >= 0) {
            try {
                setSelection(selStart, selEnd)
            } catch (_: IndexOutOfBoundsException) {
            }
        }
    }

    override fun setInputType(type: Int) {
        val selStart = selectionStart
        val selEnd = selectionEnd
        super.setInputType(type)
        applySecureTransformation()
        if (selStart >= 0 && selEnd >= 0) {
            val len = text?.length ?: 0
            try {
                setSelection(selStart.coerceAtMost(len), selEnd.coerceAtMost(len))
            } catch (_: IndexOutOfBoundsException) {
            }
        }
    }

    override fun getAutofillType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            View.AUTOFILL_TYPE_NONE
        } else {
            super.getAutofillType()
        }

    override fun getAutofillHints(): Array<String>? = null

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.isPassword = false
        info.text = null
    }

    override fun sendAccessibilityEventUnchecked(event: AccessibilityEvent) {
        if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
            event.text.clear()
            event.beforeText = ""
            event.fromIndex = 0
            event.addedCount = 0
            event.removedCount = 0
        }
        super.sendAccessibilityEventUnchecked(event)
    }

    override fun onTextContextMenuItem(id: Int): Boolean {
        if (id == android.R.id.copy || id == android.R.id.cut) {
            val currentText = text?.toString() ?: ""
            val start = selectionStart.coerceAtLeast(0)
            val end = selectionEnd.coerceAtLeast(0).coerceAtMost(currentText.length)
            if (start < end) {
                val selectedText = currentText.substring(start, end)
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("Secure Data", selectedText)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val extras = PersistableBundle()
                    extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
                    clip.description.extras = extras
                }
                clipboard.setPrimaryClip(clip)
                if (id == android.R.id.cut) {
                    text?.delete(start, end)
                    setSelection(start)
                }
                return true
            }
        }
        return super.onTextContextMenuItem(id)
    }
}
