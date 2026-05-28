package vip.chi_chi.purrivacy.shareIntent

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class ShareIntentPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            ShareIntentModule.MODULE_NAME -> ShareIntentModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                ShareIntentModule.MODULE_NAME to
                    ReactModuleInfo(
                        ShareIntentModule.MODULE_NAME,
                        ShareIntentModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
