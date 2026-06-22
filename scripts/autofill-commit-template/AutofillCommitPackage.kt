package vip.chi_chi.purrivacy

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class AutofillCommitPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            AutofillCommitModule.MODULE_NAME -> AutofillCommitModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                AutofillCommitModule.MODULE_NAME to
                    ReactModuleInfo(
                        AutofillCommitModule.MODULE_NAME,
                        AutofillCommitModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
