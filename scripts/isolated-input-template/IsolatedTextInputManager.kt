package vip.chi_chi.purrivacy.isolated

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.textinput.ReactEditText
import com.facebook.react.views.textinput.ReactTextInputManager

class IsolatedTextInputManager : ReactTextInputManager() {
    override fun getName(): String = "IsolatedTextInput"

    override fun createViewInstance(reactContext: ThemedReactContext): ReactEditText =
        IsolatedEditText(reactContext)

    @ReactProp(name = "isolatedSecureTextEntry")
    fun setIsolatedSecureTextEntry(view: ReactEditText, password: Boolean) {
        (view as? IsolatedEditText)?.setIsolatedSecureTextEntry(password)
    }

    @ReactProp(name = "keyboardType")
    fun setIsolatedKeyboardType(view: ReactEditText, keyboardType: String?) {
        super.setKeyboardType(view, keyboardType)
    }

    @ReactProp(name = "placeholder")
    fun setIsolatedPlaceholder(view: ReactEditText, placeholder: String?) {
        super.setPlaceholder(view, placeholder)
    }

    @ReactProp(name = "multiline")
    fun setIsolatedMultiline(view: ReactEditText, multiline: Boolean) {
        super.setMultiline(view, multiline)
    }

    @ReactProp(name = "autoCorrect")
    fun setIsolatedAutoCorrect(view: ReactEditText, autoCorrect: Boolean) {
        super.setAutoCorrect(view, autoCorrect)
    }

    @ReactProp(name = "isolatedText")
    fun setIsolatedText(view: ReactEditText, text: String?) {
        val current = view.text?.toString() ?: ""
        if (text != null && text != current) {
            view.setText(text)
            view.setSelection(text.length)
        }
    }

    @ReactProp(name = "textAlignVertical")
    fun setIsolatedTextAlignVertical(view: ReactEditText, textAlignVertical: String?) {
        super.setTextAlignVertical(view, textAlignVertical)
    }

    @ReactProp(name = "textAlign")
    fun setIsolatedTextAlign(view: ReactEditText, textAlign: String?) {
        super.setTextAlign(view, textAlign)
    }
}
